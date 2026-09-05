import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { BendLine } from '../../../core/models';
import { BendEditorCanvasComponent, DraftBend } from '../../../shared/bend-editor/bend-editor-canvas.component';
import { QuoteDraftService, readWizardParams } from '../wizard';

@Component({
  selector: 'app-bends-step',
  imports: [BendEditorCanvasComponent],
  templateUrl: './bends-step.component.html',
  styleUrl: './steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendsStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);

  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });
  readonly params = computed(() => readWizardParams(this.queryParams()));
  readonly drawing = computed(() => this.draft.drawing(this.params().drawingId));
  readonly bends = this.draft.bends;

  readonly bendMode = signal(true);
  readonly selectedId = signal<string | null>(null);
  readonly pendingDraft = signal<DraftBend | null>(null);
  readonly angle = signal(90);
  readonly direction = signal<'up' | 'down'>('up');
  readonly angleError = signal<string | null>(null);

  readonly selected = computed(() => this.bends().find((b) => b.id === this.selectedId()) ?? null);
  readonly canSave = computed(() => this.pendingDraft() !== null || this.selected() !== null);

  toggleBendMode(): void {
    this.bendMode.update((on) => !on);
  }

  onDrawn(draft: DraftBend): void {
    this.pendingDraft.set(draft);
    this.selectedId.set(null);
  }

  onSelected(id: string | null): void {
    this.selectedId.set(id);
    this.pendingDraft.set(null);
    const bend = this.bends().find((b) => b.id === id);
    if (bend) {
      this.angle.set(bend.angleDeg);
      this.direction.set(bend.direction);
    }
  }

  onMoved(move: { id: string; dx: number; dy: number }): void {
    const bend = this.bends().find((b) => b.id === move.id);
    if (!bend) return;
    this.draft.updateBend(move.id, {
      startX: bend.startX + move.dx,
      startY: bend.startY + move.dy,
      endX: bend.endX + move.dx,
      endY: bend.endY + move.dy,
    });
  }

  onAngle(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.angle.set(value);
    this.angleError.set(
      Number.isFinite(value) && value >= 0 && value <= 180 ? null : 'Bend angle must be between 0° and 180°.',
    );
  }

  onDirection(event: Event): void {
    this.direction.set((event.target as HTMLSelectElement).value as 'up' | 'down');
  }

  /** Rotates the selected bend about its midpoint. */
  rotate(degrees: number): void {
    const bend = this.selected();
    if (!bend) return;
    const cx = (bend.startX + bend.endX) / 2;
    const cy = (bend.startY + bend.endY) / 2;
    const radians = (degrees * Math.PI) / 180;
    const spin = (x: number, y: number): [number, number] => [
      cx + (x - cx) * Math.cos(radians) - (y - cy) * Math.sin(radians),
      cy + (x - cx) * Math.sin(radians) + (y - cy) * Math.cos(radians),
    ];
    const [sx, sy] = spin(bend.startX, bend.startY);
    const [ex, ey] = spin(bend.endX, bend.endY);
    this.draft.updateBend(bend.id, { startX: sx, startY: sy, endX: ex, endY: ey });
  }

  save(): void {
    if (this.angleError()) return;
    const selected = this.selected();
    if (selected) {
      this.draft.updateBend(selected.id, { angleDeg: this.angle(), direction: this.direction() });
      this.syncCount();
      return;
    }
    const draft = this.pendingDraft();
    if (!draft) return;
    const bend: BendLine = {
      id: `bnd_${Math.round(this.bends().length + 1)}_${this.bends().length}`,
      drawingId: this.params().drawingId || 'drw_1',
      startX: draft.startX,
      startY: draft.startY,
      endX: draft.endX,
      endY: draft.endY,
      angleDeg: this.angle(),
      direction: this.direction(),
    };
    this.draft.addBend(bend);
    this.pendingDraft.set(null);
    this.selectedId.set(bend.id);
    this.syncCount();
  }

  remove(id: string): void {
    this.draft.removeBend(id);
    if (this.selectedId() === id) this.selectedId.set(null);
    this.syncCount();
  }

  private syncCount(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { bends: this.bends().length },
      queryParamsHandling: 'merge',
    });
  }
}
