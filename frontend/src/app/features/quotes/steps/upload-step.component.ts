import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { Drawing } from '../../../core/models';
import { QuoteDraftService, readWizardParams } from '../wizard';
import { WorkbedCanvasComponent } from '../../../shared/workbed/workbed-canvas.component';

@Component({
  selector: 'app-upload-step',
  imports: [WorkbedCanvasComponent],
  templateUrl: './upload-step.component.html',
  styleUrl: './steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);

  readonly machine = this.draft.machine;
  readonly drawings = this.draft.drawings;
  readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });
  readonly params = computed(() => readWizardParams(this.queryParams()));

  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly error = signal<string | null>(null);
  readonly hint = signal<string | null>(null);

  readonly selected = computed<Drawing | null>(() => {
    const id = this.params().drawingId;
    return id ? (this.drawings().find((d) => d.id === id) ?? null) : null;
  });

  readonly maxMb = computed(() => (this.machine().maxUploadBytes / 1048576).toFixed(0));
  readonly extensions = computed(() => this.machine().allowedExtensions.join(', '));

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set(null);
    this.hint.set(null);

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!this.machine().allowedExtensions.includes(extension)) {
      this.hint.set(`${extension || 'That file'} is not accepted. Upload a ${this.extensions()} drawing.`);
      input.value = '';
      return;
    }
    if (file.size > this.machine().maxUploadBytes) {
      this.hint.set(`That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${this.maxMb()} MB.`);
      input.value = '';
      return;
    }
    this.simulateUpload(file.name);
    input.value = '';
  }

  /** Picks one of the account's parsed drawings (stands in for a real upload in preview). */
  choose(drawing: Drawing): void {
    this.error.set(null);
    this.hint.set(null);
    this.simulateUpload(drawing.filename, drawing.id);
  }

  simulateParseFailure(): void {
    this.error.set(
      'Could not parse corrupt.dxf: unexpected end of section at line 214. No supported entities were found.',
    );
    this.setDrawing('');
  }

  private simulateUpload(filename: string, drawingId?: string): void {
    this.uploading.set(true);
    this.percent.set(0);
    const target = drawingId ?? this.matchByName(filename);
    const tick = () => {
      this.percent.update((p) => Math.min(100, p + 14));
      if (this.percent() < 100) {
        setTimeout(tick, 90);
        return;
      }
      this.uploading.set(false);
      this.setDrawing(target);
    };
    setTimeout(tick, 90);
  }

  private matchByName(filename: string): string {
    const match = this.drawings().find((d) => d.filename.toLowerCase() === filename.toLowerCase());
    return (match ?? this.drawings()[0]).id;
  }

  private setDrawing(drawingId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { drawingId: drawingId || null },
      queryParamsHandling: 'merge',
    });
  }
}
