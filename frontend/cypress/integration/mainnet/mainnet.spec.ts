import { emitMempoolInfo, dropWebSocket } from "../../support/websocket";

const baseModule = Cypress.env("BASE_MODULE");


//Credit: https://github.com/bahmutov/cypress-examples/blob/6cedb17f83a3bb03ded13cf1d6a3f0656ca2cdf5/docs/recipes/overlapping-elements.md

/**
 * Returns true if two DOM rectangles are overlapping
 * @param {DOMRect} rect1 the bounding client rectangle of the first element
 * @param {DOMRect} rect2 the bounding client rectangle of the second element
 * @returns {boolean}
*/
const areOverlapping = (rect1, rect2) => {
  // if one rectangle is on the left side of the other
  if (rect1.right < rect2.left || rect2.right < rect1.left) {
    return false
  }

  // if one rectangle is above the other
  if (rect1.bottom < rect2.top || rect2.bottom < rect1.top) {
    return false
  }

  // the rectangles must overlap
  return true
}

/**
 * Returns the bounding rectangle of the first DOM
 * element in the given jQuery object.
 */
const getRectangle = ($el) => $el[0].getBoundingClientRect();

describe('Mainnet', () => {
  beforeEach(() => {
    //cy.intercept('/sockjs-node/info*').as('socket');
    cy.intercept('/api/block-height/*').as('block-height');
    cy.intercept('/api/block/*').as('block');
    cy.intercept('/api/block/*/txs/0').as('block-txs');
    cy.intercept('/api/tx/*/outspends').as('tx-outspends');
    cy.intercept('/resources/pools.json').as('pools');

    // Search Auto Complete
    cy.intercept('/api/address-prefix/1wiz').as('search-1wiz');
    cy.intercept('/api/address-prefix/1wizS').as('search-1wizS');
    cy.intercept('/api/address-prefix/1wizSA').as('search-1wizSA');

    Cypress.Commands.add('waitForBlockData', () => {
      cy.wait('@tx-outspends');
      cy.wait('@pools');
    });
  });

  if (baseModule === 'mempool') {

    it('check first mempool block after skeleton loads', () => {
      cy.visit('/');
      cy.waitForSkeletonGone();
      cy.get('#mempool-block-0 > .blockLink').should('exist');
    });

    it('loads the status screen', () => {
      cy.visit('/status');
      cy.get('#mempool-block-0').should('be.visible');
      cy.get('[id^="bitcoin-block-"]').should('have.length', 8);
      cy.get('.footer').should('be.visible');
      cy.get('.row > :nth-child(1)').invoke('text').then((text) => {
        expect(text).to.match(/Tx vBytes per second:.* vB\/s/);
      });
      cy.get('.row > :nth-child(2)').invoke('text').then((text) => {
        expect(text).to.match(/Unconfirmed:(.*)/);
      });
      cy.get('.row > :nth-child(3)').invoke('text').then((text) => {
        expect(text).to.match(/Mempool size:(.*) (kB|MB) \((\d+) (block|blocks)\)/);
      });
    });

    //TODO: This test is flaky, refactor later
    it.skip('loads dashboard, drop websocket and reconnect', () => {
      cy.viewport('macbook-16');
      cy.mockMempoolSocket();
      cy.visit('/');
      cy.get('.badge').should('not.exist');
      dropWebSocket();
      cy.get('.badge').should('be.visible');
      cy.get('.badge', { timeout: 25000 }).should('not.exist');
      emitMempoolInfo({
        'params': {
          command: 'init'
        }
      });
      cy.get(':nth-child(1) > #bitcoin-block-0').should('not.exist');
      cy.get(':nth-child(2) > #bitcoin-block-0').should('not.exist');
      cy.get(':nth-child(3) > #bitcoin-block-0').should('not.exist');
    });

    it('loads the dashboard', () => {
      cy.visit('/');
      cy.waitForSkeletonGone();
    });

    it('check op_return tx tooltip', () => {
      cy.visit('/block/00000000000000000003c5f542bed265319c6cf64238cf1f1bb9bca3ebf686d2');
      cy.waitForSkeletonGone();
      cy.get('tbody > :nth-child(2) > :nth-child(1) > a').first().trigger('onmouseover');
      cy.get('tbody > :nth-child(2) > :nth-child(1) > a').first().trigger('mouseenter');
      cy.get('.tooltip-inner').should('be.visible');
    });

    it('check op_return coinbase tooltip', () => {
      cy.visit('/block/00000000000000000003c5f542bed265319c6cf64238cf1f1bb9bca3ebf686d2');
      cy.waitForSkeletonGone();
      cy.get('div > a > .badge').first().trigger('onmouseover');
      cy.get('div > a > .badge').first().trigger('mouseenter');
      cy.get('.tooltip-inner').should('be.visible');
    });

    describe('search', () => {
      it('allows searching for partial Bitcoin addresses', () => {
        cy.visit('/');
        cy.get('.search-box-container > .form-control').type('1wiz').then(() => {
          cy.wait('@search-1wiz');
          cy.get('ngb-typeahead-window button.dropdown-item').should('have.length', 10);
        });

        cy.get('.search-box-container > .form-control').type('S').then(() => {
          cy.wait('@search-1wizS');
          cy.get('ngb-typeahead-window button.dropdown-item').should('have.length', 5);
        });

        cy.get('.search-box-container > .form-control').type('A').then(() => {
          cy.wait('@search-1wizSA');
          cy.get('ngb-typeahead-window button.dropdown-item').should('have.length', 1)
        });

        cy.get('ngb-typeahead-window button.dropdown-item.active').click().then(() => {
          cy.url().should('include', '/address/1wizSAYSbuyXbt9d8JV8ytm5acqq2TorC');
          cy.waitForSkeletonGone();
          cy.get('.text-center').should('not.have.text', 'Invalid Bitcoin address');
        });
      });

      ['BC1PQYQSZQ', 'bc1PqYqSzQ'].forEach((searchTerm) => {
        it(`allows searching for partial case insensitive bech32m addresses: ${searchTerm}`, () => {
          cy.visit('/');
          cy.get('.search-box-container > .form-control').type(searchTerm).then(() => {
            cy.get('ngb-typeahead-window button.dropdown-item').should('have.length', 1);
            cy.get('ngb-typeahead-window button.dropdown-item.active').click().then(() => {
              cy.url().should('include', '/address/bc1pqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqsyjer9e');
              cy.waitForSkeletonGone();
              cy.get('.text-center').should('not.have.text', 'Invalid Bitcoin address');
            });
          });
        });
      });

      ['BC1Q000375VXCU', 'bC1q000375vXcU'].forEach((searchTerm) => {
        it(`allows searching for partial case insensitive bech32 addresses: ${searchTerm}`, () => {
          cy.visit('/');
          cy.get('.search-box-container > .form-control').type(searchTerm).then(() => {
            cy.get('ngb-typeahead-window button.dropdown-item').should('have.length', 1);
            cy.get('ngb-typeahead-window button.dropdown-item.active').click().then(() => {
              cy.url().should('include', '/address/bc1q000375vxcuf5v04lmwy22vy2thvhqkxghgq7dy');
              cy.waitForSkeletonGone();
              cy.get('.text-center').should('not.have.text', 'Invalid Bitcoin address');
            });
          });
        });
      });

    });

    describe('blocks navigation', () => {

      describe('keyboard events', () => {
        it('loads first blockchain blocks visible and keypress arrow right', () => {
          cy.viewport('macbook-16');
          cy.visit('/');
          cy.waitForSkeletonGone();
          cy.get('.blockchain-blocks-0 > a').click().then(() => {
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('not.exist');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.waitForPageIdle();
            cy.document().right();
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
          });
        });

        it('loads first blockchain blocks visible and keypress arrow left', () => {
          cy.viewport('macbook-16');
          cy.visit('/');
          cy.waitForSkeletonGone();
          cy.get('.blockchain-blocks-0 > a').click().then(() => {
            cy.waitForPageIdle();
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('not.exist');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.document().left();
            cy.get('.title-block h1').invoke('text').should('equal', 'Next block');
          });
        });

        it('loads last blockchain blocks and keypress arrow right', () => {
          cy.viewport('macbook-16');
          cy.visit('/');
          cy.waitForSkeletonGone();
          cy.get('.blockchain-blocks-4 > a').click().then(() => {
            cy.waitForPageIdle();

            // block 6
            cy.document().right();
            cy.wait(5000);
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');

            // block 7
            cy.document().right();
            cy.wait(5000);
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');

            // block 8 - last visible block
            cy.document().right();
            cy.wait(5000);
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');

            // block 9 - not visible at the blochchain blocks visible block
            cy.document().right();
            cy.wait(5000);
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');

          });
        });

        it('loads genesis block and keypress arrow right', () => {
          cy.viewport('macbook-16');
          cy.visit('/block/0');
          cy.waitForSkeletonGone();
          cy.waitForPageIdle();

          cy.document().right();
          cy.wait(5000);
          cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
          cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('not.exist');
        });

        it('loads genesis block and keypress arrow left', () => {
          cy.viewport('macbook-16');
          cy.visit('/block/0');
          cy.waitForSkeletonGone();
          cy.waitForPageIdle();

          cy.document().left();
          cy.wait(5000);
          cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
          cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
        });
      });
      describe('mouse events', () => {
        it('loads first blockchain blocks visible and click on the arrow right', () => {
          cy.viewport('macbook-16');
          cy.visit('/');
          cy.waitForSkeletonGone();
          cy.get('.blockchain-blocks-0 > a').click().then(() => {
            cy.waitForPageIdle();
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('not.exist');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').click().then(() => {
              cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
              cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            });
          });
        });

        it('loads genesis block and click on the arrow left', () => {
          cy.viewport('macbook-16');
          cy.visit('/block/0');
          cy.waitForSkeletonGone();
          cy.waitForPageIdle();
          cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
          cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('not.exist');
          cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').click().then(() => {
            cy.get('[ngbtooltip="Next Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
            cy.get('[ngbtooltip="Previous Block"] > .ng-fa-icon > .svg-inline--fa').should('be.visible');
          });
        });
      });
    });


    it('loads skeleton when changes between networks', () => {
      cy.visit('/');
      cy.waitForSkeletonGone();

      cy.changeNetwork("testnet");
      cy.changeNetwork("signet");
      cy.changeNetwork("mainnet");
    });

    it.skip('loads the dashboard with the skeleton blocks', () => {
      cy.mockMempoolSocket();
      cy.visit("/");
      cy.get(':nth-child(1) > #bitcoin-block-0').should('be.visible');
      cy.get(':nth-child(2) > #bitcoin-block-0').should('be.visible');
      cy.get(':nth-child(3) > #bitcoin-block-0').should('be.visible');
      cy.get('#mempool-block-0').should('be.visible');
      cy.get('#mempool-block-1').should('be.visible');
      cy.get('#mempool-block-2').should('be.visible');

      emitMempoolInfo({
        'params': {
          command: 'init'
        }
      });

      cy.get(':nth-child(1) > #bitcoin-block-0').should('not.exist');
      cy.get(':nth-child(2) > #bitcoin-block-0').should('not.exist');
      cy.get(':nth-child(3) > #bitcoin-block-0').should('not.exist');
    });

    it('loads the blocks screen', () => {
      cy.visit('/');
      cy.waitForSkeletonGone();
      cy.get('#btn-blocks').click().then(() => {
        cy.waitForPageIdle();
      });
    });

    it('loads the graphs screen', () => {
      cy.visit('/');
      cy.waitForSkeletonGone();
      cy.get('#btn-graphs').click().then(() => {
        cy.wait(1000);
      });
    });

    describe('graphs page', () => {
      it('check buttons - mobile', () => {
        cy.viewport('iphone-6');
        cy.visit('/graphs');
        cy.waitForSkeletonGone();
        cy.get('.small-buttons > :nth-child(2)').should('be.visible');
        cy.get('#dropdownFees').should('be.visible');
        cy.get('.btn-group').should('be.visible');
      });
      it('check buttons - tablet', () => {
        cy.viewport('ipad-2');
        cy.visit('/graphs');
        cy.waitForSkeletonGone();
        cy.get('.small-buttons > :nth-child(2)').should('be.visible');
        cy.get('#dropdownFees').should('be.visible');
        cy.get('.btn-group').should('be.visible');
      });
      it('check buttons - desktop', () => {
        cy.viewport('macbook-16');
        cy.visit('/graphs');
        cy.waitForSkeletonGone();
        cy.get('.small-buttons > :nth-child(2)').should('be.visible');
        cy.get('#dropdownFees').should('be.visible');
        cy.get('.btn-group').should('be.visible');
      });
    });

    it('loads the tv screen - desktop', () => {
      cy.viewport('macbook-16');
      cy.visit('/');
      cy.waitForSkeletonGone();
      cy.get('#btn-tv').click().then(() => {
        cy.viewport('macbook-16');
        cy.get('.chart').should('be.visible');
        // Blocks are using aboslute positioning so we need custom visibility check
        cy.get('.blocks').isVisible();
        cy.get('#mempool-block-0').isVisible();
      });
    });

    it('loads the api screen', () => {
      cy.visit('/');
      cy.waitForSkeletonGone();
      cy.get('#btn-docs').click().then(() => {
        cy.wait(1000);
      });
    });

    describe('blocks', () => {
      it('shows empty blocks properly', () => {
        cy.visit('/block/0000000000000000000bd14f744ef2e006e61c32214670de7eb891a5732ee775');
        cy.waitForSkeletonGone();
        cy.waitForPageIdle();
        cy.get('h2').invoke('text').should('equal', '1 transaction');
      });

      it('expands and collapses the block details', () => {
        cy.visit('/block/0');
        cy.waitForSkeletonGone();
        cy.waitForPageIdle();
        cy.get('.btn.btn-outline-info').click().then(() => {
          cy.get('#details').should('be.visible');
        });

        cy.get('.btn.btn-outline-info').click().then(() => {
          cy.get('#details').should('not.be.visible');
        });
      });
      it('shows blocks with no pagination', () => {
        cy.visit('/block/00000000000000000001ba40caf1ad4cec0ceb77692662315c151953bfd7c4c4');
        cy.waitForSkeletonGone();
        cy.waitForPageIdle();
        cy.get('.block-tx-title h2').invoke('text').should('equal', '19 transactions');
        cy.get('.pagination-container ul.pagination').first().children().should('have.length', 5);
      });

      it('supports pagination on the block screen', () => {
        // 41 txs
        cy.visit('/block/00000000000000000009f9b7b0f63ad50053ad12ec3b7f5ca951332f134f83d8');
        cy.waitForSkeletonGone();
        cy.get('.pagination-container a').invoke('text').then((text1) => {
          cy.get('.active + li').first().click().then(() => {
            cy.waitForSkeletonGone();
            cy.waitForPageIdle();
            cy.get('.header-bg.box > a').invoke('text').then((text2) => {
              expect(text1).not.to.eq(text2);
            });
          });
        });
      });

      it('shows blocks pagination with 5 pages (desktop)', () => {
        cy.viewport(760, 800);
        cy.visit('/block/000000000000000000049281946d26fcba7d99fdabc1feac524bc3a7003d69b3').then(() => {
          cy.waitForSkeletonGone();
          cy.waitForPageIdle();
        });

        // 5 pages + 4 buttons = 9 buttons
        cy.get('.pagination-container ul.pagination').first().children().should('have.length', 9);
      });

      it('shows blocks pagination with 3 pages (mobile)', () => {
        cy.viewport(669, 800);
        cy.visit('/block/000000000000000000049281946d26fcba7d99fdabc1feac524bc3a7003d69b3').then(() => {
          cy.waitForSkeletonGone();
          cy.waitForPageIdle();
        });

        // 3 pages + 4 buttons = 7 buttons
        cy.get('.pagination-container ul.pagination').first().children().should('have.length', 7);
      });
    });

    describe('RBF transactions', () => {
      it('shows RBF transactions properly (mobile)', () => {
        cy.viewport('iphone-xr');
        cy.mockMempoolSocket();
        cy.visit('/tx/f81a08699b62b2070ad8fe0f2a076f8bea0386a2fdcd8124caee42cbc564a0d5');

        cy.waitForSkeletonGone();

        emitMempoolInfo({
          'params': {
            command: 'init'
          }
        });

        cy.get('#mempool-block-0');

        emitMempoolInfo({
          'params': {
            command: 'rbfTransaction'
          }
        });

        cy.get('.alert-mempool').should('be.visible');
        cy.get('.alert-mempool').invoke('css', 'width').then((alertWidth) => {
          cy.get('.container-xl > :nth-child(3)').invoke('css', 'width').should('equal', alertWidth);
        });

        cy.get('.btn-success').then(getRectangle).then((rectA) => {
          cy.get('.alert-mempool').then(getRectangle).then((rectB) => {
            expect(areOverlapping(rectA, rectB), 'Confirmations box and RBF alert are overlapping').to.be.false;
          });
        });
      });

      it('shows RBF transactions properly (desktop)', () => {
        cy.viewport('macbook-16');
        cy.mockMempoolSocket();
        cy.visit('/tx/f81a08699b62b2070ad8fe0f2a076f8bea0386a2fdcd8124caee42cbc564a0d5');

        cy.waitForSkeletonGone();

        emitMempoolInfo({
          'params': {
            command: 'init'
          }
        });

        cy.get('#mempool-block-0');

        emitMempoolInfo({
          'params': {
            command: 'rbfTransaction'
          }
        });

        cy.get('.alert-mempool').should('be.visible');

        const alertLocator = '.alert-mempool';
        const tableLocator = '.container-xl > :nth-child(3)';

        cy.get(tableLocator).invoke('css', 'width').then((firstWidth) => {
          cy.get(alertLocator).invoke('css', 'width').should('equal', firstWidth);
        });

        cy.get('.btn-success').then(getRectangle).then((rectA) => {
          cy.get('.alert-mempool').then(getRectangle).then((rectB) => {
            expect(areOverlapping(rectA, rectB), 'Confirmations box and RBF alert are overlapping').to.be.false;
          });
        });
      });
    });
  } else {
    it.skip(`Tests cannot be run on the selected BASE_MODULE ${baseModule}`);
  }
});
