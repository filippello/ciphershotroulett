use anchor_lang::prelude::*;

#[error_code]
pub enum CipherShotError {
    #[msg("Not the current shooter")]
    NotShooter,
    #[msg("Not the responder")]
    NotResponder,
    #[msg("Invalid game phase for this action")]
    InvalidPhase,
    #[msg("Invalid target value (must be 0 or 1)")]
    InvalidTarget,
    #[msg("Invalid card value (must be 0, 1, or 2)")]
    InvalidCard,
    #[msg("No cards of this type remaining")]
    NoCardsRemaining,
    #[msg("Game is already over")]
    GameOver,
    #[msg("Chamber exhausted")]
    ChamberExhausted,
}
