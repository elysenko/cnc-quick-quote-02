import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { Drawing } from '../../../core/models';
import { QuoteDraftService, readWizardParams } from '../wizard';
import { DrawingApi } from '../../../core/api/domain.service';
import { WorkbedCanvasComponent } from '../../../shared/workbed/workbed-canvas.component';

@Component({
  selector: 'app-upload-step',
  imports: [WorkbedCanvasComponent],
  templateUrl: './upload-step.component.html',
  styleUrl: './steps.css',
  // The approved design keeps a preview-only affordance in the markup. The template
  // is design-owned, so it is hidden here rather than removed, keeping it out of the
  // production UI while the mockup build still shows it.
  styles: [':host(.hide-preview-tools) .preview-tool { display: none; }'],
  host: { '[class.hide-preview-tools]': '!isPreview' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly draft = inject(QuoteDraftService);
  private readonly drawingApi = inject(DrawingApi);

  readonly isPreview = COLOSSUS_PREVIEW;
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

  constructor() {
    void this.draft.ensureLoaded();
  }

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
    void this.send(file);
    input.value = '';
  }

  /** Selects one of the account's already-parsed drawings — no re-upload needed. */
  choose(drawing: Drawing): void {
    this.error.set(null);
    this.hint.set(null);
    this.setDrawing(drawing.id);
  }

  /**
   * Preview-only affordance kept because the approved template references it. In a
   * production build it does nothing — real parse failures surface from the server's
   * own 422 message in send().
   */
  simulateParseFailure(): void {
    if (!COLOSSUS_PREVIEW) return;
    this.error.set(
      'Could not parse corrupt.dxf: unexpected end of section at line 214. No supported entities were found.',
    );
    this.setDrawing('');
  }

  /**
   * Uploads the file and adopts the parsed drawing the server returns. The progress
   * bar advances optimistically while the request is in flight and snaps to 100% on
   * completion — XHR upload events are not exposed through HttpClient promises here,
   * and a DXF is small enough that a determinate bar would add no information.
   */
  private async send(file: File): Promise<void> {
    this.uploading.set(true);
    this.percent.set(8);
    const ticker = setInterval(() => this.percent.update((p) => Math.min(92, p + 12)), 120);
    try {
      const drawing = await this.drawingApi.upload(file);
      this.percent.set(100);
      this.draft.registerDrawing(drawing);
      this.setDrawing(drawing.id);
    } catch (error) {
      // The server's 422 carries the parser's own diagnostic — show it verbatim.
      this.error.set((error as Error).message);
      this.setDrawing('');
    } finally {
      clearInterval(ticker);
      this.uploading.set(false);
    }
  }

  private setDrawing(drawingId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { drawingId: drawingId || null },
      queryParamsHandling: 'merge',
    });
  }
}
