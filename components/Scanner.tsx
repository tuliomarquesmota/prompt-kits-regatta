"use client";
// Câmera ao vivo lendo códigos de barras sem parar. Funciona offline: a leitura é toda no aparelho.
// Usa o leitor nativo do Android (BarcodeDetector) quando existe; senão, a biblioteca ZXing.
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type Detected = { rawValue: string };
type Detector = { detect(src: CanvasImageSource): Promise<Detected[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => Detector;
  }
}

const FORMATS = ["code_128", "itf", "data_matrix", "qr_code", "ean_13"];

function zxingReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.ITF,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_13,
  ]);
  hints.set(DecodeHintType.ASSUME_GS1, true);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

type Props = {
  /** Recebe todos os códigos vistos juntos (uma etiqueta pode ter dois). */
  onCodes: (codes: string[]) => void;
  paused?: boolean;
};

export default function Scanner({ onCodes, paused }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const lastSeen = useRef(new Map<string, number>());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onCodesRef = useRef(onCodes);
  onCodesRef.current = onCodes;

  // Ignora o mesmo código por 3 s, para não registrar a caixa várias vezes enquanto a câmera olha para ela
  function emit(codes: string[]) {
    if (pausedRef.current) return;
    const now = Date.now();
    const fresh = codes.filter(c => now - (lastSeen.current.get(c) ?? 0) > 3000);
    codes.forEach(c => lastSeen.current.set(c, now));
    if (fresh.length) onCodesRef.current(codes);
  }

  async function start() {
    setError(null);
    try {
      if (window.BarcodeDetector) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 } },
          audio: false,
        });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const det = new window.BarcodeDetector({ formats: FORMATS });
        let alive = true;
        const loop = async () => {
          if (!alive) return;
          try {
            const found = await det.detect(v);
            if (found.length) emit(found.map(f => f.rawValue));
          } catch {
            /* quadro ainda não pronto */
          }
          setTimeout(loop, 150);
        };
        loop();
        stopRef.current = () => {
          alive = false;
          stream.getTracks().forEach(t => t.stop());
        };
      } else {
        const controls: IScannerControls = await zxingReader().decodeFromConstraints(
          { video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false },
          video.current!,
          result => {
            if (result) emit([result.getText()]);
          },
        );
        stopRef.current = () => controls.stop();
      }
      setOn(true);
    } catch (e) {
      const name = (e as Error).name;
      setError(
        name === "NotAllowedError"
          ? "A câmera foi bloqueada. Libere o acesso à câmera nas configurações do navegador."
          : "Não consegui abrir a câmera. Use “Foto da galeria”.",
      );
    }
  }

  function stop() {
    stopRef.current();
    stopRef.current = () => {};
    setOn(false);
  }

  useEffect(() => () => stopRef.current(), []);

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      if (window.BarcodeDetector) {
        const bmp = await createImageBitmap(file);
        const found = await new window.BarcodeDetector({ formats: FORMATS }).detect(bmp);
        if (found.length) return onCodes(found.map(f => f.rawValue));
      }
      const r = await zxingReader().decodeFromImageUrl(url);
      onCodes([r.getText()]);
    } catch {
      setError("Nenhum código encontrado na foto. Tente mais perto, sem reflexo.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="video" hidden={!on}>
        <video ref={video} muted playsInline />
        <div className="aim" />
      </div>
      <div className="row">
        {on ? (
          <button className="btn" onClick={stop}>
            Parar câmera
          </button>
        ) : (
          <button className="btn primary" onClick={start}>
            Abrir câmera
          </button>
        )}
        <label
          className="btn"
          style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", fontWeight: 600 }}
        >
          Foto da galeria
          {/* Sem "capture": abre a galeria. A câmera ao vivo fica no botão ao lado. */}
          <input
            id="photo"
            type="file"
            accept="image/*"
            hidden
            onChange={e => {
              fromPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
