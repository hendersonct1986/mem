import { Express, Request, Response, NextFunction } from 'express';
import * as express from 'express';
import * as http from 'http';
import * as https from 'https';
import * as WebSocket from 'ws';
import * as cluster from 'cluster';
import axios from 'axios';

import { checkDbConnection } from './database';
import config from './config';
import routes from './routes';
import blocks from './api/blocks';
import memPool from './api/mempool';
import diskCache from './api/disk-cache';
import statistics from './api/statistics';
import websocketHandler from './api/websocket-handler';
import fiatConversion from './api/fiat-conversion';
import bisq from './api/bisq/bisq';
import bisqMarkets from './api/bisq/markets';
import donations from './api/donations';
import logger from './logger';
import backendInfo from './api/backend-info';
import loadingIndicators from './api/loading-indicators';

class Server {
  private wss: WebSocket.Server | undefined;
  private server: https.Server | http.Server | undefined;
  private app: Express;
  private currentBackendRetryInterval = 5;

  constructor() {
    this.app = express();

    if (!config.MEMPOOL.SPAWN_CLUSTER_PROCS) {
      this.startServer();
      return;
    }

    if (cluster.isMaster) {
      logger.notice(`Mempool Server (Master) is running on port ${config.MEMPOOL.HTTP_PORT} (${backendInfo.getShortCommitHash()})`);

      const numCPUs = config.MEMPOOL.SPAWN_CLUSTER_PROCS;
      for (let i = 0; i < numCPUs; i++) {
        const env = { workerId: i };
        const worker = cluster.fork(env);
        worker.process['env'] = env;
      }

      cluster.on('exit', (worker, code, signal) => {
        const workerId = worker.process['env'].workerId;
        logger.warn(`Mempool Worker PID #${worker.process.pid} workerId: ${workerId} died. Restarting in 10 seconds... ${signal || code}`);
        setTimeout(() => {
          const env = { workerId: workerId };
          const newWorker = cluster.fork(env);
          newWorker.process['env'] = env;
        }, 10000);
      });
    } else {
      this.startServer(true);
    }
  }

  startServer(worker = false) {
    this.app
      .use((req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        next();
      })
      .use(express.urlencoded({ extended: true }))
      .use(express.json());

    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    if (config.DATABASE.ENABLED) {
      checkDbConnection();
    }

    if (config.STATISTICS.ENABLED && config.DATABASE.ENABLED) {
      statistics.startStatistics();
    }

    this.setUpHttpApiRoutes();
    this.setUpWebsocketHandling();
    this.runMainUpdateLoop();

    fiatConversion.startService();
    diskCache.loadMempoolCache();

    if (config.BISQ_BLOCKS.ENABLED) {
      bisq.startBisqService();
      bisq.setPriceCallbackFunction((price) => websocketHandler.setExtraInitProperties('bsq-price', price));
      blocks.setNewBlockCallback(bisq.handleNewBitcoinBlock.bind(bisq));
    }

    if (config.BISQ_MARKETS.ENABLED) {
      bisqMarkets.startBisqService();
    }

    this.server.listen(config.MEMPOOL.HTTP_PORT, () => {
      if (worker) {
        logger.info(`Mempool Server worker #${process.pid} started`);
      } else {
        logger.notice(`Mempool Server is running on port ${config.MEMPOOL.HTTP_PORT} (${backendInfo.getShortCommitHash()})`);
      }
    });
  }

  async runMainUpdateLoop() {
    try {
      await memPool.$updateMemPoolInfo();
      await blocks.$updateBlocks();
      await memPool.$updateMempool();
      setTimeout(this.runMainUpdateLoop.bind(this), config.MEMPOOL.POLL_RATE_MS);
      this.currentBackendRetryInterval = 5;
    } catch (e) {
      const loggerMsg = `runMainLoop error: ${(e.message || e)}. Retrying in ${this.currentBackendRetryInterval} sec.`;
      if (this.currentBackendRetryInterval > 5) {
        logger.warn(loggerMsg);
      } else {
        logger.debug(loggerMsg);
      }
      logger.debug(JSON.stringify(e));
      setTimeout(this.runMainUpdateLoop.bind(this), 1000 * this.currentBackendRetryInterval);
      this.currentBackendRetryInterval *= 2;
      this.currentBackendRetryInterval = Math.min(this.currentBackendRetryInterval, 60);
    }
  }

  setUpWebsocketHandling() {
    if (this.wss) {
      websocketHandler.setWebsocketServer(this.wss);
    }
    websocketHandler.setupConnectionHandling();
    statistics.setNewStatisticsEntryCallback(websocketHandler.handleNewStatistic.bind(websocketHandler));
    blocks.setNewBlockCallback(websocketHandler.handleNewBlock.bind(websocketHandler));
    memPool.setMempoolChangedCallback(websocketHandler.handleMempoolChange.bind(websocketHandler));
    donations.setNotfyDonationStatusCallback(websocketHandler.handleNewDonation.bind(websocketHandler));
    loadingIndicators.setProgressChangedCallback(websocketHandler.handleLoadingChanged.bind(websocketHandler));
  }

  setUpHttpApiRoutes() {
    this.app
      .get(config.MEMPOOL.API_URL_PREFIX + 'transaction-times', routes.getTransactionTimes)
      .get(config.MEMPOOL.API_URL_PREFIX + 'fees/recommended', routes.getRecommendedFees)
      .get(config.MEMPOOL.API_URL_PREFIX + 'fees/mempool-blocks', routes.getMempoolBlocks)
      .get(config.MEMPOOL.API_URL_PREFIX + 'backend-info', routes.getBackendInfo)
      .get(config.MEMPOOL.API_URL_PREFIX + 'init-data', routes.getInitData)
    ;

    if (config.STATISTICS.ENABLED && config.DATABASE.ENABLED) {
      this.app
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/2h', routes.get2HStatistics)
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/24h', routes.get24HStatistics.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/1w', routes.get1WHStatistics.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/1m', routes.get1MStatistics.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/3m', routes.get3MStatistics.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/6m', routes.get6MStatistics.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'statistics/1y', routes.get1YStatistics.bind(routes))
        ;
    }

    if (config.BISQ_BLOCKS.ENABLED) {
      this.app
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/stats', routes.getBisqStats)
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/tx/:txId', routes.getBisqTransaction)
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/block/:hash', routes.getBisqBlock)
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/blocks/tip/height', routes.getBisqTip)
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/blocks/:index/:length', routes.getBisqBlocks)
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/address/:address', routes.getBisqAddress)
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/txs/:index/:length', routes.getBisqTransactions)
      ;
    }

    if (config.BISQ_MARKETS.ENABLED) {
      this.app
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/currencies', routes.getBisqMarketCurrencies.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/depth', routes.getBisqMarketDepth.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/hloc', routes.getBisqMarketHloc.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/markets', routes.getBisqMarketMarkets.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/offers', routes.getBisqMarketOffers.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/ticker', routes.getBisqMarketTicker.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/trades', routes.getBisqMarketTrades.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'bisq/markets/volumes', routes.getBisqMarketVolumes.bind(routes))
        ;
    }

    if (config.SPONSORS.ENABLED) {
      this.app
        .get(config.MEMPOOL.API_URL_PREFIX + 'donations', routes.getDonations.bind(routes))
        .get(config.MEMPOOL.API_URL_PREFIX + 'donations/images/:id', routes.getSponsorImage.bind(routes))
        .post(config.MEMPOOL.API_URL_PREFIX + 'donations', routes.createDonationRequest.bind(routes))
        .post(config.MEMPOOL.API_URL_PREFIX + 'donations-webhook', routes.donationWebhook.bind(routes))
      ;
    } else {
      this.app
        .get(config.MEMPOOL.API_URL_PREFIX + 'donations', async (req, res) => {
          try {
            const response = await axios.get('https://mempool.space/api/v1/donations', { responseType: 'stream' });
            response.data.pipe(res);
          } catch (e) {
            res.status(500).end();
          }
        })
        .get(config.MEMPOOL.API_URL_PREFIX + 'donations/images/:id', async (req, res) => {
          try {
            const response = await axios.get('https://mempool.space/api/v1/donations/images/' + req.params.id, { responseType: 'stream' });
            response.data.pipe(res);
          } catch (e) {
            res.status(500).end();
          }
        });
    }

    if (config.MEMPOOL.BACKEND !== 'esplora') {
      this.app
        .get(config.MEMPOOL.API_URL_PREFIX + 'tx/:txId', routes.getTransaction)
        .get(config.MEMPOOL.API_URL_PREFIX + 'tx/:txId/outspends', routes.getTransactionOutspends)
        .get(config.MEMPOOL.API_URL_PREFIX + 'block/:hash', routes.getBlock)
        .get(config.MEMPOOL.API_URL_PREFIX + 'blocks/:height', routes.getBlocks)
        .get(config.MEMPOOL.API_URL_PREFIX + 'blocks', routes.getBlocks)
        .get(config.MEMPOOL.API_URL_PREFIX + 'block/:hash/txs/:index', routes.getBlockTransactions)
        .get(config.MEMPOOL.API_URL_PREFIX + 'block-height/:height', routes.getBlockHeight)
        .get(config.MEMPOOL.API_URL_PREFIX + 'address/:address', routes.getAddress)
        .get(config.MEMPOOL.API_URL_PREFIX + 'address/:address/txs', routes.getAddressTransactions)
        .get(config.MEMPOOL.API_URL_PREFIX + 'address/:address/txs/chain/:txId', routes.getAddressTransactions)
        .get(config.MEMPOOL.API_URL_PREFIX + 'address-prefix/:prefix', routes.getAddressPrefix)
      ;
    }
  }
}

const server = new Server();
