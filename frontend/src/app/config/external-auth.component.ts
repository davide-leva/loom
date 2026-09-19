import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { finalize, forkJoin, switchMap } from 'rxjs';
import { AdminConfigService, AppUser, Project } from './admin-config.service';
import { EntityColumn, EntityTableComponent } from './entity-table.component';
import { ExternalApplicationInput, ExternalAuthConfig, ExternalAuthConfigService, ExternalJwtSecret } from './external-auth.service';

@Component({
  selector: 'app-external-auth',
  imports: [FormsModule, ButtonModule, CardModule, DialogModule, InputTextModule, SelectModule, EntityTableComponent],
  templateUrl: './external-auth.component.html',
  styleUrl: './external-auth.component.css'
})
export class ExternalAuthComponent implements OnInit {
  private readonly admin = inject(AdminConfigService);
  private readonly api = inject(ExternalAuthConfigService);

  readonly columns: EntityColumn[] = [
    { field: 'name', label: 'Applicazione' },
    { field: 'userCount', label: 'Numero utenti' }
  ];
  readonly algorithms = ['HS256', 'HS384', 'HS512'];
  readonly encodingOptions = [
    { label: 'No, testo normale', value: false },
    { label: 'Sì, Base64', value: true }
  ];

  projects: Project[] = [];
  projectId: number | null = null;
  config: ExternalAuthConfig | null = null;
  users: AppUser[] = [];
  loading = false;
  saving = false;
  error = '';
  formError = '';
  applicationVisible = false;
  selectedApplication: ExternalJwtSecret | null = null;
  draft: ExternalApplicationInput = this.emptyDraft();
  subject = '';
  userId: number | null = null;
  deleteVisible = false;
  applicationToDelete: ExternalJwtSecret | null = null;
  deleteError = '';

  ngOnInit(): void {
    this.loading = true;
    this.admin.projects().pipe(finalize(() => this.loading = false)).subscribe({
      next: projects => {
        this.projects = projects.sort((a, b) => a.name.localeCompare(b.name, 'it'));
        if (projects.length) this.selectProject(projects[0].id);
      },
      error: () => this.error = 'Impossibile caricare i progetti.'
    });
  }

  selectProject(id: number | null): void {
    this.projectId = id;
    this.config = null;
    this.users = [];
    this.error = '';
    this.applicationVisible = false;
    this.deleteVisible = false;
    if (id !== null) this.loadProject(id);
  }

  loadProject(id = this.projectId): void {
    if (id === null) return;
    this.loading = true;
    forkJoin({ config: this.api.get(id), members: this.admin.projectUsers(id), allUsers: this.admin.users() })
      .pipe(finalize(() => this.loading = false)).subscribe({
        next: ({ config, members, allUsers }) => {
          if (this.projectId !== id) return;
          this.config = config;
          const eligible = new Map<number, AppUser>();
          [...members, ...allUsers.filter(user => user.role === 'ADMIN')]
            .forEach(user => eligible.set(user.id, user));
          this.users = [...eligible.values()].sort((a, b) => a.username.localeCompare(b.username, 'it'));
        },
        error: () => { if (this.projectId === id) this.error = 'Impossibile caricare la configurazione.'; }
      });
  }

  setEnabled(enabled: boolean): void {
    const id = this.projectId;
    if (id === null || this.saving) return;
    this.run(this.api.setEnabled(id, enabled), id);
  }

  openCreate(): void {
    this.selectedApplication = null;
    this.draft = this.emptyDraft();
    this.subject = '';
    this.userId = null;
    this.formError = '';
    this.applicationVisible = true;
  }

  openApplication(application: ExternalJwtSecret): void {
    this.selectedApplication = application;
    this.draft = {
      name: application.name, secret: '', algorithm: application.algorithm,
      secretBase64: application.secretBase64
    };
    this.subject = '';
    this.userId = null;
    this.formError = '';
    this.applicationVisible = true;
  }

  saveApplication(): void {
    const id = this.projectId;
    const current = this.selectedApplication;
    const input = { ...this.draft, name: this.draft.name.trim() };
    if (id === null || this.saving || !input.name || (!current && !input.secret)) return;
    this.saving = true;
    this.formError = '';
    const request = current ? this.api.updateSecret(id, current.id, input) : this.api.addSecret(id, input);
    request.pipe(finalize(() => this.saving = false)).subscribe({
      next: config => {
        if (this.projectId !== id) return;
        this.config = config;
        this.selectedApplication = config.secrets.find(item => current ? item.id === current.id : item.name === input.name) ?? null;
        this.draft.secret = '';
      },
      error: (error: unknown) => {
        this.formError = error instanceof HttpErrorResponse && error.status === 409
          ? 'Esiste già un’applicazione con questo nome.'
          : 'Impossibile salvare. Verifica algoritmo, formato Base64 e lunghezza del secret.';
      }
    });
  }

  confirmDelete(application: ExternalJwtSecret): void {
    this.applicationToDelete = application;
    this.deleteError = '';
    this.deleteVisible = true;
  }

  deleteApplication(): void {
    const id = this.projectId;
    const application = this.applicationToDelete;
    if (id === null || !application || this.saving) return;
    this.saving = true;
    this.deleteError = '';
    this.api.deleteSecret(id, application.id).pipe(switchMap(() => this.api.get(id)),
      finalize(() => this.saving = false)).subscribe({
      next: config => {
        if (this.projectId !== id) return;
        this.config = config;
        this.deleteVisible = false;
        this.applicationToDelete = null;
        if (this.selectedApplication?.id === application.id) this.applicationVisible = false;
      },
      error: () => this.deleteError = 'Impossibile eliminare l’applicazione. Riprova.'
    });
  }

  addMapping(): void {
    const id = this.projectId;
    const application = this.selectedApplication;
    const subject = this.subject.trim();
    if (id === null || !application || this.saving || !subject || this.userId === null) return;
    this.run(this.api.addMapping(id, application.id, subject, this.userId), id, config => {
      this.syncApplication(config, application.id);
      this.subject = '';
      this.userId = null;
    });
  }

  deleteMapping(mappingId: number): void {
    const id = this.projectId;
    const application = this.selectedApplication;
    if (id === null || !application || this.saving) return;
    this.run(this.api.deleteMapping(id, application.id, mappingId).pipe(switchMap(() => this.api.get(id))),
      id, config => this.syncApplication(config, application.id));
  }

  private syncApplication(config: ExternalAuthConfig, id: number): void {
    this.selectedApplication = config.secrets.find(item => item.id === id) ?? null;
  }

  private run(request: import('rxjs').Observable<ExternalAuthConfig>, id: number,
              success?: (config: ExternalAuthConfig) => void): void {
    this.saving = true;
    this.formError = '';
    this.error = '';
    request.pipe(finalize(() => this.saving = false)).subscribe({
      next: config => {
        if (this.projectId !== id) return;
        this.config = config;
        success?.(config);
      },
      error: () => {
        if (this.projectId === id) {
          const message = 'Operazione non riuscita. Controlla i dati e riprova.';
          if (this.applicationVisible) this.formError = message;
          else this.error = message;
        }
      }
    });
  }

  private emptyDraft(): ExternalApplicationInput {
    return { name: '', secret: '', algorithm: 'HS256', secretBase64: false };
  }
}
