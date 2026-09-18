import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { LoginComponent } from './login.component';
import { MainLayoutComponent } from './main-layout.component';
import { SetupService } from './setup.service';

export const routes: Routes = [
  { path: 'setup', loadComponent: () => import('./setup.component').then(module => module.SetupComponent) },
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
      { path: 'dashboard', loadComponent: () => import('./home.component').then(module => module.HomeComponent) },
      { path: 'preferenze-email', loadComponent: () => import('./email-preferences.component').then(module => module.EmailPreferencesComponent) },
      { path: 'anomalie', loadComponent: () => import('./issue-board.component').then(module => module.IssueBoardComponent), data: { title: 'Anomalie', issueType: 'ANOMALY' } },
      { path: 'migliorie', loadComponent: () => import('./issue-board.component').then(module => module.IssueBoardComponent), data: { title: 'Migliorie', issueType: 'IMPROVEMENT' } },
      { path: 'implementazioni', loadComponent: () => import('./issue-board.component').then(module => module.IssueBoardComponent), data: { title: 'Implementazioni', issueType: 'IMPLEMENTATION' } },
      {
        path: 'pianificazione',
        loadComponent: () => import('./planning.component').then(module => module.PlanningComponent),
        canActivate: [() => inject(AuthService).user()?.role === 'ADMIN'
          ? true : inject(Router).createUrlTree(['/dashboard'])]
      },
      {
        path: 'configurazione',
        loadComponent: () => import('./config/configuration-layout.component')
          .then(module => module.ConfigurationLayoutComponent),
        canActivate: [() => inject(AuthService).user()?.role === 'ADMIN'
          ? true : inject(Router).createUrlTree(['/dashboard'])],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'compagnie' },
          {
            path: 'progetti',
            loadComponent: () => import('./config/projects.component').then(module => module.ProjectsComponent)
          },
          {
            path: 'compagnie',
            loadComponent: () => import('./config/companies.component').then(module => module.CompaniesComponent)
          },
          {
            path: 'team-users',
            loadComponent: () => import('./config/team-users.component').then(module => module.TeamUsersComponent)
          },
          {
            path: 'campi-ticket',
            loadComponent: () => import('./config/ticket-fields.component')
              .then(module => module.TicketFieldsComponent)
          }
        ]
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
