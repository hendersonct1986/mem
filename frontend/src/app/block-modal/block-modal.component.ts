import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiService } from '../services/api.service';
import { IBlock } from '../blockchain/interfaces';
import { MemPoolService } from '../services/mem-pool.service';
import * as Chartist from 'chartist';

@Component({
  selector: 'app-block-modal',
  templateUrl: './block-modal.component.html',
  styleUrls: ['./block-modal.component.scss']
})
export class BlockModalComponent implements OnInit {
  @Input() block: IBlock;

  mempoolVsizeFeesData: any;
  mempoolVsizeFeesOptions: any;
  conversions: any;

  constructor(
    public activeModal: NgbActiveModal,
    private apiService: ApiService,
    private memPoolService: MemPoolService,
  ) { }

  ngOnInit() {

    this.mempoolVsizeFeesOptions = {
      showArea: false,
      showLine: false,
      fullWidth: false,
      showPoint: false,
      low: 0,
      axisX: {
        position: 'start',
        showLabel: false,
        offset: 0,
        showGrid: false,
      },
      axisY: {
        position: 'end',
        scaleMinSpace: 40,
        showGrid: false,
      },
      plugins: [
        Chartist.plugins.tooltip({
          tooltipOffset: {
            x: 15,
            y: 250
          },
          transformTooltipTextFnc: (value: number): any => {
            return Math.ceil(value) + ' sat/vB';
          },
          anchorToPoint: false,
        })
      ]
    };

    this.memPoolService.conversions
      .subscribe((conversions) => {
        this.conversions = conversions;
      });

    this.apiService.listTransactionsForBlock$(this.block.height)
      .subscribe((data) => {
        this.mempoolVsizeFeesData = {
          labels: data.map((x, i) => i),
          series: [data.map((tx) => tx.fpv)]
        };
      });
  }

}
