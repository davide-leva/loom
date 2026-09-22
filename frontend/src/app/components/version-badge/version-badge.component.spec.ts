import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VersionBadgeComponent } from './version-badge.component';
import { VersionService } from '../../services/version/version.service';
import type { VersionInfo } from '../../services/version/version.types';

describe('VersionBadgeComponent', () => {
  let fixture: ComponentFixture<VersionBadgeComponent>;
  let infoSignal: ReturnType<typeof signal<VersionInfo | null>>;
  let version: { info: typeof infoSignal };

  beforeEach(async () => {
    infoSignal = signal<VersionInfo | null>(null);
    version = { info: infoSignal };

    await TestBed.configureTestingModule({
      imports: [VersionBadgeComponent],
      providers: [{ provide: VersionService, useValue: version }]
    }).compileComponents();

    fixture = TestBed.createComponent(VersionBadgeComponent);
    fixture.detectChanges();
  });

  it('shows a placeholder while info is loading', () => {
    expect(fixture.nativeElement.textContent).toContain('…');
  });

  it('prefixes version with "v" once loaded', () => {
    infoSignal.set({ version: '1.2.3', commit: 'abc1234567890',
      buildTime: '2026-09-22T14:30:15Z', environment: 'production', api: 'v1' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('v1.2.3');
  });

  it('shows environment pill in dev mode', () => {
    infoSignal.set({ version: 'dev', commit: 'local',
      buildTime: 'local', environment: 'dev', api: 'v1' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('dev');
  });
});
