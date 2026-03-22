import { useState } from 'react';
import { playSound } from '@/lib/audio';

const CARD_BLUFF = '/assets/cards/card_bluff.png';
const CARD_REDIRECT = '/assets/cards/card_redirect.png';
const GUN = '/assets/gun/gun.png';

interface Step {
  title: string;
  content: React.ReactNode;
}

const highlight: React.CSSProperties = { color: '#ffcc44', fontWeight: 'bold' };
const red: React.CSSProperties = { color: '#ff4444' };
const green: React.CSSProperties = { color: '#88cc88' };
const purple: React.CSSProperties = { color: '#cc88cc' };
const dim: React.CSSProperties = { color: '#666677' };

const cardImg: React.CSSProperties = {
  width: '64px',
  height: '90px',
  objectFit: 'cover',
  borderRadius: '4px',
  border: '2px solid #3a3a5e',
  imageRendering: 'pixelated',
};

function ChamberDiagram() {
  const rounds = ['L', 'B', 'B', 'L', 'B', 'L', 'B'];
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '12px 0 4px' }}>
      {rounds.map((r, i) => (
        <div key={i} style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 'bold',
          background: r === 'L' ? '#3a1a1a' : '#1a1a2e',
          color: r === 'L' ? '#ff4444' : '#8888aa',
          border: `2px solid ${r === 'L' ? '#5e2a2a' : '#2a2a3e'}`,
          boxShadow: r === 'L' ? '0 0 8px rgba(255,68,68,0.3)' : 'none',
        }}>
          {r === 'L' ? '~' : 'o'}
        </div>
      ))}
    </div>
  );
}

const steps: Step[] = [
  {
    title: 'THE SHOTGUN',
    content: (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <img src={GUN} alt="shotgun" style={{ width: '80px', height: '80px', objectFit: 'contain', imageRendering: 'pixelated' }} />
        </div>
        <div className="crt-box">
          <p style={{ margin: '0 0 10px', ...dim, fontSize: '10px' }}>
            The shotgun is loaded with <span style={highlight}>7 rounds</span> in random order:
          </p>
          <p style={{ margin: '0 0 6px', fontSize: '10px' }}>
            <span style={red}>3 live rounds</span> <span style={dim}>— kill the target</span>
          </p>
          <p style={{ margin: '0 0 12px', fontSize: '10px' }}>
            <span style={{ color: '#8888aa' }}>4 blank rounds</span> <span style={dim}>— nothing happens</span>
          </p>
          <ChamberDiagram />
          <p style={{ margin: '8px 0 0', ...dim, fontSize: '9px', textAlign: 'center' }}>
            <span style={red}>~</span> = live &nbsp;&nbsp; <span style={{ color: '#8888aa' }}>o</span> = blank &nbsp;&nbsp; (random order)
          </p>
        </div>
      </>
    ),
  },
  {
    title: 'YOUR TURN',
    content: (
      <>
        <p style={{ margin: '0 0 12px', ...dim, fontSize: '10px' }}>
          When it's your turn to shoot, you choose a target:
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', margin: '16px 0' }}>
          <div style={{
            padding: '12px 24px',
            background: 'linear-gradient(180deg, #1a1a2e, #15152a)',
            border: '2px solid #3a3a5e',
            borderRadius: '4px',
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <div style={{ ...highlight, fontSize: '14px' }}>YOU</div>
            <div style={{ ...dim, fontSize: '9px', marginTop: '6px' }}>Shoot yourself</div>
          </div>
          <div style={{
            padding: '12px 24px',
            background: 'linear-gradient(180deg, #2e1a1a, #2a1515)',
            border: '2px solid #5e3a3a',
            borderRadius: '4px',
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <div style={{ ...red, fontSize: '14px', fontWeight: 'bold' }}>OPP</div>
            <div style={{ ...dim, fontSize: '9px', marginTop: '6px' }}>Shoot opponent</div>
          </div>
        </div>
        <p style={{ margin: '0', fontSize: '10px', ...dim }}>
          Players alternate turns after each shot.
        </p>
      </>
    ),
  },
  {
    title: 'THE CARDS',
    content: (
      <>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', margin: '8px 0 16px' }}>
          <div style={{ textAlign: 'center' }}>
            <img src={CARD_BLUFF} alt="bluff" style={cardImg} />
            <div style={{ ...green, fontSize: '10px', marginTop: '6px', fontWeight: 'bold' }}>BLUFF</div>
            <div style={{ ...dim, fontSize: '9px' }}>x3</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <img src={CARD_REDIRECT} alt="redirect" style={cardImg} />
            <div style={{ ...purple, fontSize: '10px', marginTop: '6px', fontWeight: 'bold' }}>REDIRECT</div>
            <div style={{ ...dim, fontSize: '9px' }}>x2</div>
          </div>
        </div>
        <div className="crt-box">
          <p style={{ margin: '0 0 10px', ...dim, fontSize: '10px' }}>
            Each player starts with <span style={highlight}>5 cards</span>:
          </p>
          <p style={{ margin: '0 0 8px', fontSize: '10px' }}>
            <span style={green}>BLUFF (x3)</span> <span style={dim}>— does nothing. A decoy to confuse your opponent.</span>
          </p>
          <p style={{ margin: '0', fontSize: '10px' }}>
            <span style={purple}>REDIRECT (x2)</span> <span style={dim}>— reverses the shot. If aimed at you, it hits the shooter instead.</span>
          </p>
        </div>
      </>
    ),
  },
  {
    title: 'RESPOND',
    content: (
      <>
        <p style={{ margin: '0 0 12px', ...dim, fontSize: '10px' }}>
          When your opponent shoots at you, you must <span style={highlight}>respond with a card</span>:
        </p>
        <div className="crt-box">
          <p style={{ margin: '0 0 10px', fontSize: '10px' }}>
            <span style={red}>They shoot you</span>
            <span style={dim}> &rarr; </span>
            <span style={green}>play BLUFF</span>
            <span style={dim}> &rarr; shot goes through normally</span>
          </p>
          <p style={{ margin: '0', fontSize: '10px' }}>
            <span style={red}>They shoot you</span>
            <span style={dim}> &rarr; </span>
            <span style={purple}>play REDIRECT</span>
            <span style={dim}> &rarr; shot bounces back to shooter</span>
          </p>
        </div>
        <p style={{ margin: '12px 0 0', ...dim, fontSize: '9px' }}>
          Cards are revealed after a 3...2...1 countdown. Your opponent won't know what you played until then.
        </p>
      </>
    ),
  },
  {
    title: 'STRATEGY',
    content: (
      <>
        <p style={{ margin: '0 0 12px', ...dim, fontSize: '10px' }}>
          You only have <span style={purple}>2 REDIRECT</span> cards. Think carefully:
        </p>
        <div className="crt-box">
          <p style={{ margin: '0 0 8px', fontSize: '10px', ...dim }}>
            &bull; You don't know which round is next — it's random
          </p>
          <p style={{ margin: '0 0 8px', fontSize: '10px', ...dim }}>
            &bull; <span style={green}>BLUFF</span> exists to make your opponent doubt whether you used a REDIRECT
          </p>
          <p style={{ margin: '0', fontSize: '10px', ...dim }}>
            &bull; Once you're out of REDIRECTs, you can't deflect anything
          </p>
        </div>
        <p className="text-glow-red" style={{ margin: '14px 0 0', textAlign: 'center', ...red, fontSize: '12px', fontWeight: 'bold' }}>
          Survive. Eliminate your opponent. That's all.
        </p>
      </>
    ),
  },
];

export default function Tutorial() {
  const [step, setStep] = useState(0);
  const current = steps[step];

  const next = () => {
    playSound('click_button', 0.3);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const prev = () => {
    playSound('click_button', 0.3);
    setStep((s) => Math.max(s - 1, 0));
  };

  return (
    <div className="crt-panel" style={{
      width: '100%',
      maxWidth: '440px',
      padding: '20px 24px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button
          onClick={prev}
          disabled={step === 0}
          className="arcade-btn arcade-btn-neutral"
          style={{
            width: '32px',
            height: '32px',
            fontSize: '12px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &lt;
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <h3 className="text-glow-red" style={{
            color: '#ff4444',
            fontSize: '14px',
            margin: 0,
            letterSpacing: '3px',
          }}>
            {current.title}
          </h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: i === step ? '#ff4444' : '#2a2a3e',
                boxShadow: i === step ? '0 0 6px #ff4444' : 'none',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onClick={() => { playSound('click_button', 0.2); setStep(i); }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={next}
          disabled={step === steps.length - 1}
          className="arcade-btn arcade-btn-neutral"
          style={{
            width: '32px',
            height: '32px',
            fontSize: '12px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &gt;
        </button>
      </div>

      {/* Content */}
      <div style={{ color: '#aaaacc', fontSize: '10px', lineHeight: '1.8' }}>
        {current.content}
      </div>
    </div>
  );
}
