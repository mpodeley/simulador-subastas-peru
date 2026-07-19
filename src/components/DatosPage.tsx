import { colors, radius, space, techLabels } from '../theme'
import { Card, Loading, ReliabilityTag, SectionTitle } from './ui'
import { CmgHistoryChart } from './charts'
import {
  useBarraPrices,
  useCmgHistory,
  useFleet,
  useLicitaciones,
  useRerAuctions,
  useSources,
} from '../hooks/useData'

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }

function num(v: number | null, digits = 1) {
  return v == null ? '—' : v.toFixed(digits)
}

export function DatosPage() {
  const fleet = useFleet()
  const cmg = useCmgHistory()
  const rer = useRerAuctions()
  const lic = useLicitaciones()
  const barra = useBarraPrices()
  const sources = useSources()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <div
        style={{
          background: colors.status.warn + '18',
          border: `1px solid ${colors.status.warn}55`,
          borderRadius: radius.md,
          padding: space.md,
          fontSize: 13,
          color: colors.textSecondary,
        }}
      >
        <b style={{ color: colors.status.warn }}>⚠ Confiabilidad de datos.</b> v1 usa datos <b>curados</b> (no scrapeados);
        el pipeline automático COES/SENAMHI es Fase 4. Las cifras de "subastas renovables post-2016" que circulan online
        (p. ej. "solar 27,36 USD/MWh 2024") <b>no son confiables</b> — solo se incluyen las 4 subastas RER verificadas.
        Cada dataset lleva su nivel de confiabilidad.
      </div>

      <Card>
        <SectionTitle>Parque generador (base del despacho)</SectionTitle>
        {fleet.loading || !fleet.data ? (
          <Loading />
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Unidad</th>
                <th style={th}>Tecnología</th>
                <th style={th}>MW</th>
                <th style={th}>Costo var. USD/MWh</th>
                <th style={th}>Must-run</th>
              </tr>
            </thead>
            <tbody>
              {fleet.data.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{techLabels[u.tech] ?? u.tech}</td>
                  <td style={td}>{u.capacityMW.toLocaleString('es-PE')}</td>
                  <td style={td}>{u.heatRateMMBtuMWh ? `gas×${u.heatRateMMBtuMWh} + ${u.varCostUSDMWh}` : u.varCostUSDMWh}</td>
                  <td style={td}>{u.mustRunFraction ? `${(u.mustRunFraction * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Freshness ts={fleet.meta.generated_at} source={fleet.meta.source} />
      </Card>

      <Card>
        <SectionTitle>Costo marginal histórico (mensual, curado)</SectionTitle>
        {cmg.loading || !cmg.data ? <Loading /> : <CmgHistoryChart data={cmg.data} />}
        <Freshness ts={cmg.meta.generated_at} source={cmg.meta.source} />
      </Card>

      <Card>
        <SectionTitle>
          Subastas RER (DL 1002) <ReliabilityTag level="verified" />
        </SectionTitle>
        {rer.loading || !rer.data ? (
          <Loading />
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Ronda</th>
                <th style={th}>Año</th>
                <th style={th}>Tecnología</th>
                <th style={th}>MW</th>
                <th style={th}>GWh/año</th>
                <th style={th}>Precio USD/MWh</th>
                <th style={th}>Conf.</th>
              </tr>
            </thead>
            <tbody>
              {rer.data.map((r, i) => (
                <tr key={i}>
                  <td style={td}>{r.round}ª</td>
                  <td style={td}>{r.year}</td>
                  <td style={td}>{techLabels[r.tech] ?? r.tech}</td>
                  <td style={td}>{num(r.awardedMW, 0)}</td>
                  <td style={td}>{num(r.energyGWhYr, 0)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{num(r.priceUSDMWh)}</td>
                  <td style={td}><ReliabilityTag level={r.reliability} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
          Solo se realizaron 4 subastas RER (2010–2016); el mecanismo está suspendido desde 2016.
        </p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.lg }}>
        <Card>
          <SectionTitle>Licitaciones Ley 28832</SectionTitle>
          {lic.loading || !lic.data ? (
            <Loading />
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Proceso</th>
                  <th style={th}>Periodo</th>
                  <th style={th}>MW</th>
                </tr>
              </thead>
              <tbody>
                {lic.data.map((l, i) => (
                  <tr key={i}>
                    <td style={td} title={l.note}>{l.name}</td>
                    <td style={td}>{l.periodo}</td>
                    <td style={td}>{num(l.awardedMW, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <SectionTitle>Precio en barra (energía)</SectionTitle>
          {barra.loading || !barra.data ? (
            <Loading />
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Periodo</th>
                  <th style={th}>USD/MWh</th>
                </tr>
              </thead>
              <tbody>
                {barra.data.map((b, i) => (
                  <tr key={i}>
                    <td style={td}>{b.period}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{b.energia_usd_mwh.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Fuentes</SectionTitle>
        {sources.loading || !sources.data ? (
          <Loading />
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Fuente</th>
                <th style={th}>Acceso</th>
                <th style={th}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {sources.data.map((s) => (
                <tr key={s.id}>
                  <td style={td}>
                    <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
                  </td>
                  <td style={td}>
                    <span style={{ color: s.cors === 'live' ? colors.status.ok : colors.textMuted }}>
                      {s.cors === 'live' ? 'en vivo' : 'pipeline'}
                    </span>
                  </td>
                  <td style={{ ...td, color: colors.textMuted }}>{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function Freshness({ ts, source }: { ts: string | null; source: string | null }) {
  if (!ts && !source) return null
  return (
    <div style={{ color: colors.textDim, fontSize: 11, marginTop: space.sm }}>
      {source && <span>Fuente: {source}. </span>}
      {ts && <span>Generado: {ts.slice(0, 10)}.</span>}
    </div>
  )
}
