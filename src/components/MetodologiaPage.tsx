import { colors, space } from '../theme'
import { Card, SectionTitle } from './ui'

const p: React.CSSProperties = { color: colors.textSecondary, fontSize: 14, lineHeight: 1.65, marginBottom: space.md }
const code: React.CSSProperties = { background: colors.surfaceAlt, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 13 }

export function MetodologiaPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg, maxWidth: 820 }}>
      <Card>
        <SectionTitle>El modelo en una frase</SectionTitle>
        <p style={p}>
          Un modelo <b>fundamental de orden de mérito</b> arma, para cada hora representativa, la curva de oferta del SEIN
          (renovables e hidro de pasada a costo ~0, luego el valor del agua, luego las térmicas ordenadas por costo
          variable), la cruza con la demanda y deja que la <b>unidad marginal fije el costo marginal (CMg)</b>. Sobre esa
          trayectoria de precios se evalúa qué precio de oferta conviene.
        </p>
      </Card>

      <Card>
        <SectionTitle>Granularidad</SectionTitle>
        <p style={p}>
          El año se representa con <b>12 meses × 24 horas = 288 celdas</b>, cada una ponderada por los días del mes. Esto
          captura la canibalización solar del mediodía y la estacionalidad hidrológica sin el costo de simular 8.760 horas.
          La energía anual de una celda es <span style={code}>MW × días_del_mes</span> MWh.
        </p>
      </Card>

      <Card>
        <SectionTitle>Formación del precio</SectionTitle>
        <p style={p}>
          Por celda: <span style={code}>residual = demanda − renovables − hidro_must_run</span>. Se apilan las térmicas por
          costo variable (el del gas sigue el precio de Camisea vía <span style={code}>gas × heat rate</span>) y el bloque
          marginal fija el CMg; si la oferta no alcanza, se aplica el precio tope de escasez.
        </p>
        <p style={p}>
          El <b>valor del agua</b> no es fijo: cae hacia cero cuando hay abundancia (los embalses vierten) y sube en sequía.
          Se modela inverso al cuadrado del factor hidrológico — así se reproducen tanto las horas de CMg cercano a cero de la
          sobreoferta 2016–2022 como el firmamiento de precios en años secos.
        </p>
      </Card>

      <Card>
        <SectionTitle>Evaluación de la oferta ("modelo genérico vendedor")</SectionTitle>
        <p style={p}>
          El vendedor se compromete a entregar energía a un precio fijo K y queda expuesto al spot. La P&L por hora es:
        </p>
        <p style={{ ...p, textAlign: 'center' }}>
          <span style={code}>pnl_h = gen_h·(CMg_h − costo_var) + vol_h·(K − CMg_h)</span>
        </p>
        <p style={p}>
          El primer término es el margen merchant de la generación propia; el segundo, la liquidación tipo contrato por
          diferencias sobre el bloque contratado. Los presets solo cambian cómo se asignan <span style={code}>gen</span> y{' '}
          <span style={code}>vol</span>:
        </p>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><b>Merchant</b>: sin contrato (vol = 0), pura exposición spot.</li>
          <li><b>CfD / Ley 28832</b>: bloque contratado a precio firme + generación propia; difieren en horizonte e indexación.</li>
          <li><b>RER (prima)</b>: la prima liquida toda la generación al precio K con despacho prioritario → se transfiere el riesgo spot.</li>
        </ul>
        <p style={p}>
          Como la P&L es lineal en K, el NPV sobre el horizonte y el <b>precio de equilibrio K*</b> (NPV = 0) son de forma
          cerrada. El break-even es el piso al que podrías ofertar cubriendo capital.
        </p>
      </Card>

      <Card>
        <SectionTitle>Límites del modelo</SectionTitle>
        <p style={p}>
          Es un modelo <b>copperplate</b>: sin red de transmisión ni congestión, sin unit commitment (arranques, mínimos
          técnicos) ni oferta estratégica. La hidro se trata como energía limitada por un factor de capacidad, no con
          optimización de embalses multi-anual. Sirve para entender el <b>driver dominante</b> del precio (demanda residual vs.
          costo de la pila) y ordenar decisiones de oferta; no reemplaza el modelo de despacho del COES.
        </p>
        <p style={p}>
          v1 usa datos <b>curados</b>. La fase probabilística (Monte Carlo sobre hidrología y meteorología) y el pipeline de
          datos reales COES/SENAMHI están planificados como fases siguientes.
        </p>
      </Card>
    </div>
  )
}
