import { colors, space } from '../theme'
import { Card, Field, Grid, NumberInput, SectionTitle, Select, Slider, Stat, StatRow } from './ui'
import { CashflowChart, MarginVsPriceChart } from './charts'
import type { BidResult, Contract, GenTech, Indexation, Settlement, VolumeShape } from '../engine/bid'

const SETTLEMENTS: { value: Settlement; label: string }[] = [
  { value: 'firme_28832', label: 'Licitación Ley 28832 (precio firme)' },
  { value: 'prima_rer', label: 'Subasta RER (prima)' },
  { value: 'cfd', label: 'Contrato por diferencias (CfD)' },
  { value: 'merchant', label: 'Merchant (sin contrato)' },
]
const GEN_TECHS: { value: GenTech; label: string }[] = [
  { value: 'solar', label: 'Solar FV' },
  { value: 'wind', label: 'Eólica' },
  { value: 'hydro', label: 'Hidro' },
  { value: 'gas_ccgt', label: 'Gas CC' },
  { value: 'none', label: 'Sin generación (financiero)' },
]
const SHAPES: { value: VolumeShape; label: string }[] = [
  { value: 'flat', label: 'Bloque plano' },
  { value: 'solar', label: 'Perfil solar' },
  { value: 'wind', label: 'Perfil eólico' },
]
const INDEX: { value: Indexation; label: string }[] = [
  { value: 'none', label: 'Sin indexación' },
  { value: 'cpi', label: 'IPC / CPI' },
  { value: 'gas', label: 'Gas / combustible' },
]

/** Preset side-effects when the settlement type changes. */
function settlementDefaults(s: Settlement): Partial<Contract> {
  if (s === 'prima_rer') return { settlement: s, horizonYears: 20, indexation: 'cpi', priorityDispatch: true }
  if (s === 'firme_28832') return { settlement: s, horizonYears: 15, indexation: 'cpi', priorityDispatch: false }
  if (s === 'cfd') return { settlement: s, horizonYears: 10, priorityDispatch: false }
  return { settlement: s }
}

const M = (n: number) => `${(n / 1e6).toFixed(1)} M`

export function OfertaPage({
  contract,
  bid,
  avgCmg,
  onContract,
}: {
  contract: Contract
  bid: BidResult
  avgCmg: number
  onContract: (patch: Partial<Contract>) => void
}) {
  const merchant = contract.settlement === 'merchant'
  const prima = contract.settlement === 'prima_rer'
  const profitable = bid.npv > 0
  const marginOverBE = bid.breakEvenK != null ? contract.priceK - bid.breakEvenK : null

  return (
    <Grid cols="minmax(300px, 360px) 1fr">
      <Card>
        <SectionTitle>Contrato de la oferta</SectionTitle>
        <Field label="Tipo de liquidación">
          <Select value={contract.settlement} options={SETTLEMENTS} onChange={(v) => onContract(settlementDefaults(v))} />
        </Field>

        {!merchant && (
          <Slider label="Precio de oferta (K)" value={contract.priceK} min={10} max={120} step={0.5} onChange={(v) => onContract({ priceK: v })} unit="USD/MWh" />
        )}

        <SectionTitle>Generación propia</SectionTitle>
        <Field label="Tecnología">
          <Select value={contract.genTech} options={GEN_TECHS} onChange={(v) => onContract({ genTech: v, genVarCostUSDMWh: v === 'gas_ccgt' ? 28 : 0 })} />
        </Field>
        <Slider label="Capacidad instalada" value={contract.genCapacityMW} min={0} max={600} step={10} onChange={(v) => onContract({ genCapacityMW: v })} unit="MW" />
        {contract.genTech === 'gas_ccgt' && (
          <Slider label="Costo variable" value={contract.genVarCostUSDMWh} min={0} max={120} step={1} onChange={(v) => onContract({ genVarCostUSDMWh: v })} unit="USD/MWh" />
        )}

        {!merchant && !prima && (
          <>
            <SectionTitle>Bloque contratado</SectionTitle>
            <Slider label="Potencia contratada" value={contract.contractedMW} min={0} max={400} step={10} onChange={(v) => onContract({ contractedMW: v })} unit="MW" />
            <Field label="Perfil del bloque">
              <Select value={contract.volumeShape} options={SHAPES} onChange={(v) => onContract({ volumeShape: v })} />
            </Field>
          </>
        )}
        {prima && (
          <p style={{ color: colors.textMuted, fontSize: 12 }}>
            En RER la prima liquida <b>toda</b> la generación al precio K con despacho prioritario: el riesgo spot se transfiere.
          </p>
        )}

        <SectionTitle>Financiero</SectionTitle>
        <Grid cols="1fr 1fr">
          <Field label="Horizonte (años)">
            <NumberInput value={contract.horizonYears} min={1} max={25} onChange={(v) => onContract({ horizonYears: v })} />
          </Field>
          <Field label="WACC (%)">
            <NumberInput value={contract.waccPct} step={0.5} min={0} max={20} onChange={(v) => onContract({ waccPct: v })} />
          </Field>
        </Grid>
        <Field label="Indexación de K">
          <Select value={contract.indexation} options={INDEX} onChange={(v) => onContract({ indexation: v })} />
        </Field>
        {contract.indexation !== 'none' && (
          <Slider label="Tasa de indexación" value={contract.indexRatePct} min={0} max={6} step={0.25} onChange={(v) => onContract({ indexRatePct: v })} unit="%/año" />
        )}
        <Field label="Capex (USD)">
          <NumberInput value={contract.capexUSD} step={1_000_000} min={0} onChange={(v) => onContract({ capexUSD: v })} />
        </Field>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <Card>
          <SectionTitle>Veredicto de la oferta</SectionTitle>
          <StatRow>
            <Stat label={merchant ? 'NPV merchant' : 'NPV a K'} value={M(bid.npv)} unit="USD" accent={profitable ? colors.status.ok : colors.status.err} />
            <Stat label="Precio de equilibrio K*" value={bid.breakEvenK != null ? bid.breakEvenK.toFixed(1) : '—'} unit="USD/MWh" accent={colors.accent.orange} hint="Precio de oferta que hace NPV = 0" />
            <Stat label="P&L anual (año 1)" value={M(bid.annualPnL)} unit="USD" />
            <Stat label="Precio captura" value={bid.captureUSDMWh.toFixed(1)} unit="USD/MWh" hint="Spot medio capturado por la generación propia" />
            <Stat label="CMg escenario" value={avgCmg.toFixed(1)} unit="USD/MWh" accent={colors.accent.cyan} />
          </StatRow>
          {!merchant && marginOverBE != null && (
            <p style={{ marginTop: space.md, color: profitable ? colors.status.ok : colors.status.err, fontSize: 13 }}>
              {profitable
                ? `Ofertar a ${contract.priceK.toFixed(1)} deja ${marginOverBE.toFixed(1)} USD/MWh de margen sobre el equilibrio (${bid.breakEvenK!.toFixed(1)}). Podrías bajar hasta ~${bid.breakEvenK!.toFixed(1)} y seguir cubriendo capital.`
                : `A ${contract.priceK.toFixed(1)} la oferta destruye valor: el equilibrio está en ${bid.breakEvenK!.toFixed(1)} USD/MWh. Subí el precio o los supuestos no cierran.`}
            </p>
          )}
          {bid.captureUSDMWh > 0 && bid.captureUSDMWh < avgCmg - 1 && (
            <p style={{ marginTop: 4, color: colors.textMuted, fontSize: 12 }}>
              La captura ({bid.captureUSDMWh.toFixed(1)}) está por debajo del CMg medio ({avgCmg.toFixed(1)}): canibalización del recurso.
            </p>
          )}
        </Card>

        {!merchant && (
          <Card>
            <SectionTitle>NPV vs. precio de oferta</SectionTitle>
            <MarginVsPriceChart intercept={bid.npvIntercept} slope={bid.npvSlope} currentK={contract.priceK} breakEvenK={bid.breakEvenK} />
          </Card>
        )}

        <Card>
          <SectionTitle>Cashflow anual (año 1)</SectionTitle>
          <CashflowChart
            contractRevenue={bid.contractRevenue}
            genSpotRevenue={bid.genSpotRevenue}
            genCost={bid.genCost}
            spotSettlement={bid.spotSettlement}
            net={bid.annualPnL}
          />
          <StatRow>
            <Stat label="Generación propia" value={bid.ownGenGWh.toFixed(0)} unit="GWh/año" />
            <Stat label="Energía contratada" value={bid.contractedGWh.toFixed(0)} unit="GWh/año" />
          </StatRow>
        </Card>
      </div>
    </Grid>
  )
}
