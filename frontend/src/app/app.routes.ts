import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { LoginComponent } from './components/login/login.component';
import { MainLayoutComponent } from './components/main-layout/main-layout.component';
import { AuthService } from './services/auth/auth.service';
import { SetupService } from './services/setup/setup.service';

export const routes: Routes = [
  { path: 'setup', loadComponent: () => import('./components/setup/setup.component').then(module => module.SetupComponent) },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [() => {
      const auth = inject(AuthService);
      const router = inject(Router);
      const setup = inject(SetupService);
      return setup.status().pipe(
        switchMap(status => status.required
          ? of(router.createUrlTree(['/setup']))
          : auth.hasValidSession().pipe(map(valid => valid ? true : router.createUrlTree(['/login'])))),
        catchError(() => of(router.createUrlTree(['/login'])))
      );
    }],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./components/home/home.component').then(module => module.HomeComponent) },
      { path: 'eventi', loadComponent: () => import('./components/events/events.component').then(module => module.EventsComponent),
        canActivate: [() => ['ADMIN', 'TEAM'].includes(inject(AuthService).user()?.role ?? '')
          ? true : inject(Router).createUrlTree(['/dashboard'])] },
      { path: 'preferenze-email', loadComponent: () => import('./components/email-preferences/email-preferences.component').then(module => module.EmailPreferencesComponent) },
      { path: 'anomalie', loadComponent: () => import('./components/segnalazioni-board/segnalazioni-board.component').then(module => module.SegnalazioniBoardComponent), data: { title: 'Anomalie', issueType: 'ANOMALY' } },
      { path: 'migliorie', loadComponent: () => import('./components/segnalazioni-board/segnalazioni-board.component').then(module => module.SegnalazioniBoardComponent), data: { title: 'Migliorie', issueType: 'IMPROVEMENT' } },
      { path: 'implementazioni', loadComponent: () => import('./components/segnalazioni-board/segnalazioni-board.component').then(module => module.SegnalazioniBoardComponent), data: { title: 'Implementazioni', issueType: 'IMPLEMENTATION' } },
      {
        path: 'pianificazione',
        loadComponent: () => import('./components/planning/planning.component').then(module => module.PlanningComponent),
        canActivate: [() => inject(AuthService).user()?.role === 'ADMIN'
          ? true : inject(Router).createUrlTree(['/dashboard'])]
      },
      {
        path: 'eliminate',
        loadComponent: () => import('./components/segnalazioni-eliminate/segnalazioni-eliminate.component').then(module => module.SegnalazioniEliminateComponent),
        canActivate: [() => inject(AuthService).user()?.role === 'ADMIN'
          ? true : inject(Router).createUrlTree(['/dashboard'])]
      },
      {
        path: 'archivio',
        loadComponent: () => import('./components/segnalazioni-archiviate/segnalazioni-archiviate.component').then(module => module.SegnalazioniArchiviateComponent)
      },
      {
        path: 'configurazione',
        loadComponent: () => import('./components/config/configuration-layout/configuration-layout.component')
          .then(module => module.ConfigurationLayoutComponent),
        canActivate: [() => inject(AuthService).user()?.role === 'ADMIN'
          ? true : inject(Router).createUrlTree(['/dashboard'])],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'compagnie' },
          {
            path: 'progetti',
            loadComponent: () => import('./components/config/projects/projects.component').then(module => module.ProjectsComponent)
          },
          {
            path: 'compagnie',
            loadComponent: () => import('./components/config/companies/companies.component').then(module => module.CompaniesComponent)
          },
          {
            path: 'team-users',
            loadComponent: () => import('./components/config/team-users/team-users.component').then(module => module.TeamUsersComponent)
          },
          {
            path: 'campi-segnalazione',
            loadComponent: () => import('./components/config/campi-segnalazione/campi-segnalazione.component')
              .then(module => module.CampiSegnalazioneComponent)
          },
          {
            path: 'autenticazione-esterna',
            loadComponent: () => import('./components/config/external-auth/external-auth.component')
              .then(module => module.ExternalAuthComponent)
          }
        ]
      }
    ]
  },
  { path: '**', redirectTo: '' }
];