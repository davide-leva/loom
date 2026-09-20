import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ProjectContextService } from '../../services/project-context/project-context.service';

@Component({
  selector: 'app-section-page',
  imports: [AsyncPipe, CardModule],
  template: `
    <p-card>
      @if (route.data | async; as data) {
        <h1>{{ data['title'] }}</h1>
      }
      @if (projects.currentProject(); as project) {
        <p>Progetto corrente: <strong>{{ project.name }}</strong></p>
      } @else {
        <p>Seleziona un progetto dall'header per iniziare.</p>
      }
      <p>Questa sezione sarà disponibile a breve.</p>
    </p-card>
  `,
  styles: [`h1 { margin-top: 0; color: var(--p-primary-700); font-size: 24px; }`]
})
export class SectionPageComponent {
  readonly route = inject(ActivatedRoute);
  readonly projects = inject(ProjectContextService);
}
