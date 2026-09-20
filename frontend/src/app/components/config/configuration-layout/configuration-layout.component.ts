import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-configuration-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CardModule],
  templateUrl: './configuration-layout.component.html',
  styleUrl: './configuration-layout.component.css'
})
export class ConfigurationLayoutComponent {}
