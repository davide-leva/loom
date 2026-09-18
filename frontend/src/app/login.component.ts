import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { finalize } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from './setup.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, PasswordModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly setup = inject(SetupService);

  username = '';
  password = '';
  loading = false;
  error = '';

  ngOnInit(): void {
    this.setup.status().subscribe({ next: status => { if (status.required) void this.router.navigateByUrl('/setup'); } });
  }

  login(): void {
    if (!this.username.trim() || !this.password || this.loading) {
      return;
    }
    this.error = '';
    this.loading = true;
    this.auth.login(this.username, this.password).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (error: unknown) => {
        this.error = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)
          ? 'Username o password non validi.'
          : 'Accesso non disponibile. Verifica che il backend sia avviato e riprova.';
      }
    });
  }
}
