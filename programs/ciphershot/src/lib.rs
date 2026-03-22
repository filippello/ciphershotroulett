use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod instructions;
pub mod state;
pub mod errors;

use instructions::*;

declare_id!("DMg6pfojshfqeUBbhwPKsTVbFFoppVm2QrctF1WfzXWn");

#[ephemeral]
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

    /// Delegate batch A: match_config, chamber, player_a_cards
    pub fn delegate_match_a(ctx: Context<DelegateMatchA>, match_id: [u8; 32], player_a: Pubkey) -> Result<()> {
        instructions::delegate_match::handler_a(ctx, match_id, player_a)
    }

    /// Delegate batch B: player_b_cards, pending_action, round_results
    pub fn delegate_match_b(ctx: Context<DelegateMatchB>, match_key: Pubkey, player_b: Pubkey) -> Result<()> {
        instructions::delegate_match::handler_b(ctx, match_key, player_b)
    }

    /// Undelegate all match accounts back to L1.
    /// Zeros sensitive data before undelegation. Must be sent to ER endpoint.
    pub fn undelegate_match(ctx: Context<UndelegateMatch>) -> Result<()> {
        instructions::undelegate_match::handler(ctx)
    }
}
