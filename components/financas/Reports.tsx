"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { accountTotals, vatSums } from "@/lib/finance";
import {
  balanceSheet,
  currentPeriod,
  periodRange,
  profitAndLoss,
  shiftPeriod,
  trialBalanceCsv,
  vatBoxes,
  type AccountTotal,
  type Period,
  type ReportLine,
  type VatSums,
} from "@/lib/reports";
import { brDate, errorText, money } from "@/lib/sales";
import Margins from "@/components/financas/Margins";

type Props = { org: Org };
type Data = { period: AccountTotal[]; toDate: AccountTotal[]; vat: VatSums };

const KINDS: { key: Period["kind"]; label: string }[] = [
  { key: "mes", label: "Mês" },
  { key: "trimestre", label: "Trimestre" },
  { key: "ano", label: "Ano" },
];

function Lines({ rows }: { rows: ReportLine[] }) {
  if (!rows.length)
    return (
      <p className="muted" style={{ margin: 0 }}>
        Nada no período.
      </p>
    );
  return (
    <dl>
      {rows.map(l => (
        <div className="field" key={l.code}>
          <dt>
            <span className="mono">{l.code}</span> {l.name}
          </dt>
          <dd>{money(l.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Total({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <div className="row spread" style={{ fontWeight: 700, fontSize: big ? 18 : 16 }}>
      <span>{label}</span>
      <span className="mono" style={{ color: value < 0 ? "var(--bad-fg)" : undefined }}>
        {money(value)}
      </span>
    </div>
  );
}

/** DRE, balanço e prévia do VAT do período escolhido. */
export default function Reports({ org }: Props) {
  const [period, setPeriod] = useState<Period>(() => currentPeriod("mes"));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = periodRange(period);

  useEffect(() => {
    setData(null);
    setError(null);
    Promise.all([
      accountTotals(org.id, range.from, range.to),
      accountTotals(org.id, null, range.to),
      vatSums(org.id, range.from, range.to),
    ])
      .then(([p, t, v]) => setData({ period: p, toDate: t, vat: v }))
      .catch(e => setError(errorText(e)));
  }, [org.id, range.from, range.to]);

  function download() {
    if (!data) return;
    const blob = new Blob(["﻿" + trialBalanceCsv(data.period)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `balancete-${range.from}-a-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pl = data && profitAndLoss(data.period);
  const bs = data && balanceSheet(data.toDate);
  const vat = data && vatBoxes(data.vat);

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Tipo de período">
        {KINDS.map(k => (
          <button
            key={k.key}
            role="tab"
            aria-selected={period.kind === k.key}
            className={period.kind === k.key ? "on" : ""}
            onClick={() => setPeriod(currentPeriod(k.key))}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="row spread">
        <button className="btn small" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Período anterior">
          ←
        </button>
        <strong>{range.label}</strong>
        <button className="btn small" onClick={() => setPeriod(shiftPeriod(period, 1))} aria-label="Próximo período">
          →
        </button>
      </div>

      {error && <p className="note bad">{error}</p>}
      {!data && !error && <p className="muted">Calculando…</p>}

      {data && <Margins orgId={org.id} from={range.from} to={range.to} label={range.label} />}

      {pl && (
        <section className="panel" aria-label="Resultado do período">
          <strong>Resultado (DRE)</strong>
          <span className="muted">Receitas</span>
          <Lines rows={pl.income} />
          <Total label="Receita" value={pl.revenue} />
          <span className="muted">Custo da mercadoria e importação</span>
          <Lines rows={pl.costs} />
          <Total label={`Lucro bruto${pl.margin !== null ? ` · margem ${pl.margin}%` : ""}`} value={pl.gross} />
          <span className="muted">Despesas</span>
          <Lines rows={pl.expenses} />
          <Total label={pl.net >= 0 ? "Lucro do período" : "Prejuízo do período"} value={pl.net} big />
        </section>
      )}

      {vat && (
        <section className="panel" aria-label="Prévia do VAT">
          <strong>Prévia do VAT · {range.label}</strong>
          <dl>
            <div className="field">
              <dt>1 · VAT nas vendas</dt>
              <dd>{money(vat.box1)}</dd>
            </div>
            <div className="field">
              <dt>2 · VAT em compras da UE</dt>
              <dd>{money(vat.box2)}</dd>
            </div>
            <div className="field">
              <dt>3 · Total devido</dt>
              <dd>{money(vat.box3)}</dd>
            </div>
            <div className="field">
              <dt>4 · VAT a recuperar nas compras</dt>
              <dd>{money(vat.box4)}</dd>
            </div>
            <div className="field">
              <dt>6 · Vendas sem VAT</dt>
              <dd>£{vat.box6.toLocaleString("pt-BR")}</dd>
            </div>
            <div className="field">
              <dt>7 · Compras sem VAT</dt>
              <dd>£{vat.box7.toLocaleString("pt-BR")}</dd>
            </div>
            <div className="field">
              <dt>8 e 9 · Vendas e compras com a UE</dt>
              <dd>£0</dd>
            </div>
          </dl>
          <Total
            label={vat.box5 >= 0 ? "5 · A pagar à HMRC" : "5 · A receber da HMRC"}
            value={Math.abs(vat.box5)}
            big
          />
          <p className="note info" style={{ margin: 0 }}>
            Prévia para conferir com o contador; ainda não é enviada à HMRC. A caixa 7 inclui todas as contas lançadas
            em A pagar (salários não deveriam entrar) e o VAT de importação diferido ainda não é tratado.
          </p>
        </section>
      )}

      {bs && (
        <section className="panel" aria-label="Balanço">
          <strong>Balanço em {brDate(range.to)}</strong>
          <span className="muted">Ativo (o que a empresa tem)</span>
          <Lines rows={bs.assets} />
          <Total label="Total do ativo" value={bs.totalAssets} />
          <span className="muted">Passivo (o que a empresa deve)</span>
          <Lines rows={bs.liabilities} />
          <Total label="Total do passivo" value={bs.totalLiabilities} />
          <span className="muted">Patrimônio</span>
          <Lines rows={bs.equity} />
          <dl>
            <div className="field">
              <dt>Resultado acumulado (não fechado)</dt>
              <dd>{money(bs.result)}</dd>
            </div>
          </dl>
          <Total label="Total do patrimônio" value={bs.totalEquity} />
          <p className={`note ${bs.balanced ? "ok" : "bad"}`} style={{ margin: 0 }}>
            {bs.balanced
              ? "Confere: ativo = passivo + patrimônio."
              : "Não confere: ativo diferente de passivo + patrimônio. Avise o suporte."}
          </p>
        </section>
      )}

      {data && (
        <button className="btn" onClick={download}>
          Baixar balancete do período (CSV)
        </button>
      )}
    </>
  );
}
