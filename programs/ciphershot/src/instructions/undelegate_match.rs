use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use crate::state::*;

/// Undelegate all match accounts back to L1.
/// Zeros sensitive data, then commits and undelegates via MagicBlock SDK.

#[commit]
#[derive(Accounts)]
pub struct UndelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub match_config: Account<'info, MatchConfig>,

    #[account(mut)]
    pub chamber: Account<'info, Chamber>,

    #[account(mut)]
    pub player_a_cards: Account<'info, PlayerCards>,

    #[account(mut)]
    pub player_b_cards: Account<'info, PlayerCards>,

    #[account(mut)]
    pub pending_action: Account<'info, PendingAction>,
}

pub fn handler(ctx: Context<UndelegateMatch>) -> Result<()> {
    // Zero out sensitive data (privacy — prevents leaking after undelegation)
    ctx.accounts.chamber.rounds = [0; 7];
    ctx.accounts.player_a_cards.bluffs = 0;
    ctx.accounts.player_a_cards.redirects = 0;
    ctx.accounts.player_b_cards.bluffs = 0;
    ctx.accounts.player_b_cards.redirects = 0;
    ctx.accounts.pending_action.card_played = 0;

    // Serialize modified accounts before committing
    ctx.accounts.chamber.exit(&crate::ID)?;
    ctx.accounts.player_a_cards.exit(&crate::ID)?;
    ctx.accounts.player_b_cards.exit(&crate::ID)?;
    ctx.accounts.pending_action.exit(&crate::ID)?;
    ctx.accounts.match_config.exit(&crate::ID)?;

    // Commit and undelegate all accounts atomically
    commit_and_undelegate_accounts(
        &ctx.accounts.payer,
        vec![
            &ctx.accounts.match_config.to_account_info(),
            &ctx.accounts.chamber.to_account_info(),
            &ctx.accounts.player_a_cards.to_account_info(),
            &ctx.accounts.player_b_cards.to_account_info(),
            &ctx.accounts.pending_action.to_account_info(),
        ],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    msg!("Match data zeroed and undelegated");
    Ok(())
}
