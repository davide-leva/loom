import { Component, computed, inject } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';
import { VersionService } from '../../services/version/version.service';

@Component({
  selector: 'app-version-badge',
  imports: [Tooltip],
  templateUrl: './version-badge.component.html',
  styleUrl: './version-badge.component.css'
})
export class VersionBadgeComponent {
  private readonly version = inject(VersionService);
  readonly info = this.version.info;

  readonly label = computed(() => {
    const v = this.info()?.version ?? '…';
    return v === 'dev' ? 'dev' : `v${v}`;
  });

  readonly tooltipText = computed(() => {
    const i = this.info();
    if (!i) {
      return 'Informazioni di build non disponibili.';
    }
    const lines = [
      `Versione: ${i.version}`,
      `Build: ${this.formatBuildTime(i.buildTime)}`,
      `Commit: ${this.shortCommit(i.commit)}`,
      `API: ${i.api}`,
      `Ambiente: ${i.environment}`,
      `API base: ${location.origin}`
    ];
    return lines.join('\n');
  });

  private shortCommit(commit: string): string {
    if (commit.length > 12) return commit.slice(0, 12);
    return commit;
  }

  private formatBuildTime(raw: string): string {
    if (raw === 'local' || raw === 'unknown' || !raw) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('it-IT', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}
