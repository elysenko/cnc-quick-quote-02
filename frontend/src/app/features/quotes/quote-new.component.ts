import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { QuoteDraftService, WIZARD_STEPS, WizardStep, readWizardParams } from './wizard';

/**
 * New-quote wizard shell. Step, drawing, material and quantity all live in the URL,
 * so a hard refresh or a deep link restores the wizard exactly where it was.
 */
@Component({
  selector: 'app-quote-new',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './quote-new.component.html',
  styleUrl: './quote-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteNewComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);

  readonly steps = WIZARD_STEPS;

  constructor() {
    // The shell's canAdvance() gate reads the server's qtyMin/qtyMax, so the config
    // must be loaded even when a deep link lands directly on a later step.
    void this.draft.ensureLoaded();
  }
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly step = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => (this.route.firstChild?.snapshot.data['step'] as WizardStep) ?? 'upload'),
      takeUntilDestroyed(),
    ),
    { initialValue: (this.route.firstChild?.snapshot.data['step'] as WizardStep) ?? 'upload' },
  );

  readonly params = computed(() => readWizardParams(this.queryParams()));
  readonly stepIndex = computed(() => this.steps.findIndex((s) => s.key === this.step()));

  readonly canAdvance = computed(() => {
    const { drawingId, materialId, qty } = this.params();
    const cfg = this.draft.pricing();
    switch (this.step()) {
      case 'upload':
        return !!drawingId;
      case 'material':
        return !!materialId && qty >= cfg.qtyMin && qty <= cfg.qtyMax;
      default:
        return true;
    }
  });

  readonly blockedReason = computed(() => {
    if (this.canAdvance()) return '';
    return this.step() === 'upload'
      ? 'Upload a DXF drawing to continue.'
      : 'Choose a material and a valid quantity to continue.';
  });

  go(offset: number): void {
    const next = this.steps[this.stepIndex() + offset];
    if (!next) return;
    void this.router.navigate(['/quotes/new', next.key], {
      queryParams: this.queryParams() ? this.snapshotParams() : {},
    });
  }

  stepLink(step: WizardStep): unknown[] {
    return ['/quotes/new', step];
  }

  snapshotParams(): Record<string, string> {
    const map = this.queryParams();
    const out: Record<string, string> = {};
    map?.keys.forEach((key) => {
      const value = map.get(key);
      if (value !== null) out[key] = value;
    });
    return out;
  }

  isDone(index: number): boolean {
    return index < this.stepIndex();
  }
}
