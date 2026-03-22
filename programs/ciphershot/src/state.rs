use anchor_lang::prelude::*;

/// Game phases matching the TypeScript GamePhase type.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    ChoosingTarget,    // 0
    RespondingCard,    // 1
    Resolving,         // 2
    GameOver,          // 3
}

impl Default for Phase {
    fn default() -> Self {
        Phase::ChoosingTarget
    }
}

/// Public match configuration and state.
/// PDA: ["match", match_id]
#[account]
#[derive(Default)]
pub struct MatchConfig {
    pub match_id: [u8; 32],
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub current_shooter: Pubkey,
    pub phase: Phase,
    pub current_shot_index: u8,
    pub selected_target: u8,    // 0=self, 1=opponent, 255=unset
    pub player_a_alive: bool,
    pub player_b_alive: bool,
    pub winner: Pubkey,         // Pubkey::default() if no winner yet
    pub bump: u8,
}

impl MatchConfig {
    pub const SIZE: usize = 8  // discriminator
        + 32   // match_id
        + 32   // player_a
        + 32   // player_b
        + 32   // current_shooter
        + 1    // phase
        + 1    // current_shot_index
        + 1    // selected_target
        + 1    // player_a_alive
        + 1    // player_b_alive
        + 32   // winner
        + 1;   // bump
}

/// Chamber with 7 rounds (3 live=1, 4 blank=0). Fisher-Yates shuffled.
/// **Shielded in PER** — only readable inside TEE.
/// PDA: ["chamber", match_id]
#[account]
#[derive(Default)]
pub struct Chamber {
    pub rounds: [u8; 7],
    pub bump: u8,
}

impl Chamber {
    pub const SIZE: usize = 8 + 7 + 1;
}

/// Per-player card inventory.
/// **Shielded in PER** — each player sees only their own.
/// PDA: ["cards", match_id, player_pubkey]
#[account]
#[derive(Default)]
pub struct PlayerCards {
    pub owner: Pubkey,
    pub bluffs: u8,
    pub redirects: u8,
    pub bump: u8,
}

impl PlayerCards {
    pub const SIZE: usize = 8 + 32 + 1 + 1 + 1;
}

/// Pending card action (shielded in PER).
/// PDA: ["action", match_id]
#[account]
#[derive(Default)]
pub struct PendingAction {
    pub card_played: u8,  // 0=pass, 1=bluff, 2=redirect
    pub bump: u8,
}

impl PendingAction {
    pub const SIZE: usize = 8 + 1 + 1;
}

/// Result of a resolved round (public after resolution).
/// PDA: ["result", match_id, shot_index (as u8)]
#[account]
#[derive(Default)]
pub struct RoundResult {
    pub shooter: Pubkey,
    pub final_target: Pubkey,
    pub killed: bool,
    pub card_played: u8,
    pub shot_index: u8,
    pub bump: u8,
}

impl RoundResult {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 1 + 1 + 1;
}
