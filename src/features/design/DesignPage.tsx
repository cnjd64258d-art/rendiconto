import { useState, type CSSProperties, type ReactNode } from 'react';
import { TAG_COLORS, TAG_COLOR_LABELS } from '../../core/colors';
import { formatCents } from '../../core/format';
import {
  AnimatedAmount,
  BackLink,
  Banner,
  Button,
  Chip,
  Chips,
  EmptyState,
  ListGroup,
  Page,
  ProgressBar,
  ProgressRing,
  Property,
  Row,
  SegmentedControl,
  Sheet,
  SwipeRow,
  Tag,
  showToast,
} from '../../ui/components';
import styles from './DesignPage.module.css';

const COLOR_TOKENS = [
  'bg',
  'bg-grouped',
  'surface',
  'fill',
  'separator',
  'text',
  'text-secondary',
  'text-tertiary',
  'accent',
  'positive',
  'warning',
  'negative',
] as const;

const TYPE_SCALE = [
  ['large-title', 'Titolo grande', 700],
  ['title1', 'Titolo 1', 700],
  ['title2', 'Titolo 2', 600],
  ['title3', 'Titolo 3', 600],
  ['body', 'Corpo del testo', 400],
  ['subhead', 'Sottotitolo', 400],
  ['footnote', 'Nota a piè di pagina', 400],
  ['caption', 'Didascalia', 400],
] as const;

const SPACES = [1, 2, 3, 4, 6, 8, 12] as const;
const RADII = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export default function DesignPage() {
  const [segment, setSegment] = useState<'month' | 'year' | 'custom'>('month');
  const [chip, setChip] = useState('Cibo');
  const [amount, setAmount] = useState(128450);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <Page title="Design system" leading={<BackLink href="#/impostazioni" label="Impostazioni" />}>
      <Section title="Colori">
        <div className={styles.swatches}>
          {COLOR_TOKENS.map((t) => (
            <div key={t} className={styles.swatch}>
              <div className={styles.chip} style={{ background: `var(--color-${t})` }} />
              {t}
            </div>
          ))}
        </div>
        <p className={styles.caption}>Quasi monocromatico, grigi caldi e un solo accento. Il tema scuro è automatico.</p>
      </Section>

      <Section title="Colori delle categorie">
        <div className={styles.tags}>
          {TAG_COLORS.map((c) => (
            <Tag key={c} color={c}>
              {TAG_COLOR_LABELS[c]}
            </Tag>
          ))}
        </div>
        <div className={styles.tags} style={{ marginTop: 'var(--space-3)' }}>
          <Tag color="orange" emoji="☕️">
            Cibo
          </Tag>
          <Tag color="green" emoji="🛒">
            Alimentari
          </Tag>
          <Tag color="blue" emoji="🚗">
            Trasporti
          </Tag>
          <Tag color="purple" emoji="🎾">
            Svago
          </Tag>
          <Tag color="brown" emoji="🏠">
            Mutuo
          </Tag>
        </div>
      </Section>

      <Section title="Tipografia">
        <div className={styles.type}>
          <div className={styles.typeRow}>
            <span className={styles.hero}>1.284,50 €</span>
          </div>
          {TYPE_SCALE.map(([token, label, weight]) => (
            <div key={token} className={styles.typeRow}>
              <span style={{ fontSize: `var(--text-${token})`, fontWeight: weight }}>{label}</span>
              <span className={styles.typeMeta}>{token}</span>
            </div>
          ))}
        </div>
        <p className={styles.caption}>
          SF Pro di sistema, cifre tabellari per gli importi. Il testo segue la dimensione scelta nelle impostazioni di iOS.
        </p>
      </Section>

      <Section title="Spaziature e raggi">
        <div className={styles.stack}>
          {SPACES.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={styles.typeMeta} style={{ width: 56 }}>
                {s * 4}px
              </span>
              <div className={styles.spaceBar} style={{ width: `var(--space-${s})` }} />
            </div>
          ))}
        </div>
        <div className={styles.rowFlex} style={{ marginTop: 'var(--space-4)' }}>
          {RADII.map((r) => (
            <div key={r} className={styles.radius} style={{ borderRadius: `var(--radius-${r})` }}>
              {r}
            </div>
          ))}
        </div>
        <div className={styles.pad} style={{ marginTop: 'var(--space-4)' }}>
          <div className={styles.hairline} />
          <p className={styles.caption} style={{ padding: 'var(--space-2) 0 0' }}>
            Separatore da 0,5 px, nessuna ombra pesante.
          </p>
        </div>
      </Section>

      <Section title="Pulsanti">
        <div className={styles.stack}>
          <Button size="large" block onClick={() => showToast('Salvato')}>
            Salva
          </Button>
          <Button variant="secondary" block>
            Salva e aggiungi un'altra
          </Button>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="plain">Annulla</Button>
            <Button variant="destructive">Elimina</Button>
            <Button disabled>Disattivato</Button>
          </div>
        </div>
      </Section>

      <Section title="Lista raggruppata">
        <ListGroup header="Dati" footer="Righe da 48 px, target di tocco sempre ≥ 44 px.">
          <Row icon="🏷️" label="Categorie" value="14" chevron onClick={() => showToast('Categorie')} />
          <Row icon="💳" label="Metodi di pagamento" value="4" chevron onClick={() => showToast('Metodi')} />
          <Row icon="🗑️" label="Cancella tutto" destructive onClick={() => showToast('Solo una prova')} />
        </ListGroup>
      </Section>

      <Section title="Proprietà stile Notion">
        <div className={styles.properties}>
          <Property icon="📅" name="Data">
            mar 13 gen
          </Property>
          <Property icon="🗓️" name="Competenza">
            gennaio 2026
          </Property>
          <Property icon="🏷️" name="Categoria">
            <Tag color="orange" emoji="☕️">
              Cibo
            </Tag>
          </Property>
          <Property icon="💳" name="Metodo">
            Satispay
          </Property>
          <Property icon="#" name="Tag">
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <Tag>lavoro</Tag>
              <Tag>milano</Tag>
            </span>
          </Property>
        </div>
      </Section>

      <Section title="Chip e controllo segmentato">
        <Chips label="Categoria">
          {['Cibo', 'Alimentari', 'Trasporti', 'Svago', 'Viaggi', 'Abbonamenti'].map((c) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
              {c}
            </Chip>
          ))}
        </Chips>
        <div className={styles.pad} style={{ marginTop: 'var(--space-4)' }}>
          <SegmentedControl
            label="Periodo"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'month', label: 'Mese' },
              { value: 'year', label: 'Anno' },
              { value: 'custom', label: 'Personalizzato' },
            ]}
          />
        </div>
      </Section>

      <Section title="Avanzamento">
        <div className={styles.stack}>
          <ProgressBar value={0.45} label="Cibo, 45% del budget" />
          <ProgressBar value={0.85} label="Svago, 85% del budget" />
          <ProgressBar value={1.1} label="Viaggi, 110% del budget" thick />
        </div>
        <div className={styles.rowFlex} style={{ marginTop: 'var(--space-4)' }}>
          <ProgressRing value={0.45} label="Cibo" />
          <ProgressRing value={0.85} label="Svago" />
          <ProgressRing value={1.1} label="Viaggi" />
        </div>
        <p className={styles.caption}>Avviso all'80% (ambra) e al 100% (rosso).</p>
      </Section>

      <Section title="Numeri animati">
        <div className={styles.pad}>
          <AnimatedAmount cents={amount} className={styles.hero} />
        </div>
        <div className={styles.rowFlex} style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={() => setAmount((a) => a + 1240)}>
            + {formatCents(1240)}
          </Button>
          <Button variant="secondary" onClick={() => setAmount((a) => Math.max(0, a - 73443))}>
            − {formatCents(73443)}
          </Button>
        </div>
      </Section>

      <Section title="Riga con swipe">
        <div className={styles.swipeList}>
          {[
            ['☕️', 'Colazione', 'Satispay · oggi', 240],
            ['🚗', 'ShareNow', 'PayPal · ieri', 1490],
          ].map(([emoji, title, meta, cents]) => (
            <SwipeRow
              key={String(title)}
              actions={[
                { label: 'Modifica', tone: 'accent', onAction: () => showToast('Modifica') },
                { label: 'Elimina', tone: 'destructive', onAction: () => showToast('Eliminata (prova)') },
              ]}
            >
              <div className={styles.txRow}>
                <span className={styles.txEmoji} aria-hidden="true">
                  {emoji}
                </span>
                <span className={styles.txText}>
                  <span className={styles.txTitle}>{title}</span>
                  <span className={styles.txMeta}>{meta}</span>
                </span>
                <span className={styles.txAmount}>{formatCents(Number(cents))}</span>
              </div>
            </SwipeRow>
          ))}
        </div>
        <p className={styles.caption}>Scorri una riga verso sinistra.</p>
      </Section>

      <Section title="Avvisi e stati vuoti">
        <Banner icon="💾" tone="warning" action={{ label: 'Esegui', onClick: () => showToast('Backup (prova)') }}>
          L'ultimo backup è di 9 giorni fa
        </Banner>
        <Banner icon="✨" action={{ label: 'Aggiorna', onClick: () => showToast('Aggiornata (prova)') }}>
          Nuova versione disponibile
        </Banner>
        <EmptyState emoji="🗂️" title="Ancora nessuna transazione" action={<Button variant="secondary">Aggiungi la prima</Button>}>
          Tocca ＋ per registrare una spesa in pochi secondi.
        </EmptyState>
      </Section>

      <Section title="Sheet e conferme">
        <div className={styles.stack}>
          <Button variant="secondary" block onClick={() => setSheetOpen(true)}>
            Apri uno sheet
          </Button>
          <Button variant="secondary" block onClick={() => showToast('Spesa registrata')}>
            Mostra una conferma
          </Button>
        </div>
      </Section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label="Esempio di sheet"
        title="Esempio"
        trailing={
          <Button variant="plain" onClick={() => setSheetOpen(false)} style={{ fontWeight: 600 } as CSSProperties}>
            Fine
          </Button>
        }
      >
        <EmptyState emoji="👋" title="Trascinami giù">
          Chiudi lo sheet trascinando la maniglia, toccando fuori o con «Fine».
        </EmptyState>
      </Sheet>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}
