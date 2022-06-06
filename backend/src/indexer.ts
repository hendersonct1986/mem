import { Common } from './api/common';
import blocks from './api/blocks';
import mempool from './api/mempool';
import mining from './api/mining';
import logger from './logger';
import HashratesRepository from './repositories/HashratesRepository';
import blocksRates from './api/blocks-rates';

class Indexer {
  runIndexer = true;
  indexerRunning = false;

  constructor() {
  }

  public reindex() {
    this.runIndexer = true;
  }

  public async $run() {
    if (!Common.indexingEnabled() || this.runIndexer === false ||
      this.indexerRunning === true || mempool.hasPriority()
    ) {
      return;
    }

    this.runIndexer = false;
    this.indexerRunning = true;

    try {
      await blocks.$generateBlockDatabase();
      await this.$resetHashratesIndexingState();
      await mining.$generateNetworkHashrateHistory();
      await mining.$generatePoolHashrateHistory();
      await blocksRates.savePendingBlockRates();
    } catch (e) {
      this.reindex();
      logger.err(`Indexer failed, trying again later. Reason: ` + (e instanceof Error ? e.message : e));
    }

    this.indexerRunning = false;
  }

  async $resetHashratesIndexingState() {
    try {
      await HashratesRepository.$setLatestRun('last_hashrates_indexing', 0);
      await HashratesRepository.$setLatestRun('last_weekly_hashrates_indexing', 0);
    } catch (e) {
      logger.err(`Cannot reset hashrate indexing timestamps. Reason: ` + (e instanceof Error ? e.message : e));
    }
  }
}

export default new Indexer();
