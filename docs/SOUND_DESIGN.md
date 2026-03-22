# CipherShot — Sound Design

Estética: **dark noir, western underground, taverna clandestina**.
Sonidos graves, metálicos, con reverb de sala cerrada. Gratificantes pero tensos.

---

## Sonidos del juego

### 1. `match_found.mp3`
**Momento**: Cuando el matchmaking encuentra oponente y empieza la partida.

> **Prompt**: Dark cinematic impact hit, deep bass drop with metallic ring, like two heavy coins slamming on a wooden table in a dimly lit underground bar. Short reverb tail. Ominous but exciting. 2 seconds.

---

### 2. `turn_start.mp3`
**Momento**: Cuando cambia el turno y se ilumina el nuevo shooter.

> **Prompt**: Low-pitched mechanical click followed by a subtle dark synth swell, like a revolver cylinder being rotated one position and locking into place. Metallic, precise, cold. 1 second.

---

### 3. `choose_target.mp3`
**Momento**: Cuando el shooter elige su target (self u opponent).

> **Prompt**: Sharp leather holster draw sound, quick and decisive, followed by a faint low-frequency hum that builds tension. Like pulling a sawed-off shotgun from under a table. Dry, close-mic feel. 0.8 seconds.

---

### 4. `card_submit.mp3`
**Momento**: Cuando el responder juega su carta (encriptada, no se sabe cuál es).

> **Prompt**: A playing card being slapped face-down on a wooden table, firm and deliberate. Followed by a brief mysterious low drone, like something hidden has been set in motion. The sound of a secret being sealed. 1 second.

---

### 5. `countdown_tick.mp3`
**Momento**: Cada número del countdown (3... 2... 1...).

> **Prompt**: Deep resonant clock tick, like a heavy grandfather clock in a stone room. Each tick has weight and finality. Low metallic resonance with subtle echo. Single tick, dark and foreboding. 0.5 seconds.

---

### 6. `countdown_final.mp3`
**Momento**: El "1" final del countdown, justo antes de la revelación.

> **Prompt**: Intense low-frequency boom combined with a sharp metallic snap, like a bear trap closing. Building sub-bass that cuts abruptly. The sound of fate being sealed. Tense, dramatic. 0.8 seconds.

---

### 7. `card_reveal.mp3`
**Momento**: Cuando se revela la carta jugada (grande en el centro de la pantalla).

> **Prompt**: A card being flipped over on wood with a dramatic whoosh, followed by a dark orchestral stinger — low strings and a subtle brass swell. Mysterious reveal moment, like uncovering a hidden ace. Cinematic but brief. 1.2 seconds.

---

### 8. `shot_live.mp3`
**Momento**: Disparo con bala real (round live). Alguien muere.

> **Prompt**: Powerful sawed-off shotgun blast in a closed room. Deep, booming explosion with wood and glass rattling aftermath. Heavy reverb, echo bouncing off stone walls. Devastating and final. The room shakes. 1.5 seconds.

---

### 9. `shot_blank.mp3`
**Momento**: Disparo con bala de salva (round blank). Nadie muere.

> **Prompt**: Dry click of a gun hammer hitting an empty chamber, followed by a hollow metallic ring. Anticlimactic but tense — the relief is palpable. Like Russian roulette surviving a turn. Brief room silence after. 0.8 seconds.

---

### 10. `kill.mp3`
**Momento**: Cuando un jugador muere (se desploma).

> **Prompt**: A body slumping against a wooden chair and hitting the floor, followed by a dark low drone that fades out. Glass rolling off a table and shattering distantly. The aftermath of violence in a quiet room. Somber, heavy. 2 seconds.

---

### 11. `win.mp3`
**Momento**: Victoria — "YOU WIN" en pantalla.

> **Prompt**: Dark triumphant brass fanfare, low and menacing rather than heroic. Like a villain's victory theme — you survived but at what cost. Deep horns over a pulsing bass, with poker chips being raked across a table. Satisfying but unsettling. 3 seconds.

---

### 12. `lose.mp3`
**Momento**: Derrota — "YOU LOSE" en pantalla.

> **Prompt**: Descending low piano notes, slow and deliberate, like a funeral march condensed into 2 seconds. A single heavy bell toll at the end. Empty, hollow, final. The sound of a game lost in a smoky back room. 2.5 seconds.

---

### 13. `hover_button.mp3`
**Momento**: Hover sobre cualquier botón interactivo.

> **Prompt**: Extremely subtle wooden creak, like shifting weight on an old chair. Almost subliminal, very quiet. A hint of tension. 0.2 seconds.

---

### 14. `click_button.mp3`
**Momento**: Click en cualquier botón.

> **Prompt**: Sharp snap of a poker chip being placed on felt, clean and satisfying. Slight woody undertone. Decisive, tactile. 0.3 seconds.

---

### 15. `queue_waiting.mp3` (loop)
**Momento**: Mientras espera en la cola de matchmaking.

> **Prompt**: Dark ambient loop. Distant muffled bar sounds — low murmuring voices, occasional glass clink, a ceiling fan slowly turning. Underground poker den atmosphere. Moody, patient, slightly threatening. Seamless loop. 8 seconds.

---

### 16. `chamber_advance.mp3`
**Momento**: Cuando se avanza al siguiente round del chamber (después de resolver un blank).

> **Prompt**: Revolver cylinder rotating with a precise mechanical click-click-stop. Cold steel against steel. Smooth rotation ending in a definitive lock. Like the next round sliding into position. 0.6 seconds.

---

### 17. `redirect_reveal.mp3`
**Momento**: Cuando se revela que la carta jugada fue REDIRECT (variante de card_reveal).

> **Prompt**: A sharp ricochet-like metallic whip sound, like a bullet changing direction mid-air. Followed by a brief dissonant synth stab. The sound of the unexpected — the gun suddenly pointing the other way. Jarring, electric. 0.8 seconds.

---

### 18. `bluff_reveal.mp3`
**Momento**: Cuando se revela que la carta jugada fue BLUFF.

> **Prompt**: A dry mocking chuckle-like sound made from wooden percussion — like knocking on a table smugly. Followed by a faint low laugh-like brass note. The sound of deception revealed — nothing changed, it was all a lie. 0.8 seconds.

---

## Estructura de archivos

```
public/assets/sounds/
├── match_found.mp3
├── turn_start.mp3
├── choose_target.mp3
├── card_submit.mp3
├── countdown_tick.mp3
├── countdown_final.mp3
├── card_reveal.mp3
├── shot_live.mp3
├── shot_blank.mp3
├── kill.mp3
├── win.mp3
├── lose.mp3
├── hover_button.mp3
├── click_button.mp3
├── queue_waiting.mp3
├── chamber_advance.mp3
├── redirect_reveal.mp3
└── bluff_reveal.mp3
```

## Specs técnicos

- **Formato**: MP3, 128kbps (mínimo peso para web)
- **Sample rate**: 44.1kHz
- **Channels**: Mono (ahorra peso, no necesitamos stereo para SFX)
- **Normalización**: -3dB peak (para que no clipeen al superponerse)
- **Loop**: Solo `queue_waiting.mp3` necesita ser seamless loop
