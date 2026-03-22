use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;

use instructions::*;

declare_id!("DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn");

#[program]
pub mod ciphershot {
    use super::*;

    /// Initialize a new match: shuffle chamber, allocate cards.
    /// Called inside PER/TEE so chamber stays private.
    pub fn create_match(ctx: Context<CreateMatch>, match_id: [u8; 32]) -> Result<()> {
        instructions::create_match::handler(ctx, match_id)
    }

    /// Shooter chooses a target (0 = self, 1 = opponent).
    pub fn choose_target(ctx: Context<ChooseTarget>, target: u8) -> Result<()> {
        instructions::choose_target::handler(ctx, target)
    }

    /// Responder plays a card (0 = pass, 1 = bluff, 2 = redirect).
    /// Sent as plaintext to PER — TEE shields it from opponent.
    /// Automatically resolves the shot.
    pub fn play_card(ctx: Context<PlayCard>, card: u8) -> Result<()> {
        instructions::play_card::handler(ctx, card)
    }
}
