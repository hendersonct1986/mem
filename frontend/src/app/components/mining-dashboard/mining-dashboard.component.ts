import { AfterViewChecked, ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { SeoService } from '../../services/seo.service';
import { WebsocketService } from '../../services/websocket.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-mining-dashboard',
  templateUrl: './mining-dashboard.component.html',
  styleUrls: ['./mining-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiningDashboardComponent implements OnInit, AfterViewChecked {
  constructor(
    private seoService: SeoService,
    private websocketService: WebsocketService,
    private stateService: StateService
  ) {
    this.seoService.setTitle($localize`:@@a681a4e2011bb28157689dbaa387de0dd0aa0c11:Mining Dashboard`);
  }

  ngOnInit(): void {
    this.websocketService.want(['blocks', 'mempool-blocks', 'stats']);
  }

  ngAfterViewChecked(): void {
    this.stateService.searchFocus$.next(true);
  }
}
