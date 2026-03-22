use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::*;

/// Delegate first batch: match_config, chamber, player_a_cards
#[delegate]
#[derive(Accounts)]
pub struct DelegateMatchA<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: match_config PDA
    #[account(mut, del)]
    pub match_config: AccountInfo<'info>,

    /// CHECK: chamber PDA
    #[account(mut, del)]
    pub chamber: AccountInfo<'info>,

    /// CHECK: player_a_cards PDA
    #[account(mut, del)]
    pub player_a_cards: AccountInfo<'info>,
}

pub fn handler_a(ctx: Context<DelegateMatchA>, match_id: [u8; 32], player_a: Pubkey) -> Result<()> {
    let match_key = ctx.accounts.match_config.key();

    ctx.accounts.delegate_match_config(
        &ctx.accounts.payer,
        &[b"match", match_id.as_ref()],
        DelegateConfig::default(),
    )?;

    ctx.accounts.delegate_chamber(
        &ctx.accounts.payer,
        &[b"chamber", match_key.as_ref()],
        DelegateConfig::default(),
    )?;

    ctx.accounts.delegate_player_a_cards(
        &ctx.accounts.payer,
        &[b"cards", match_key.as_ref(), player_a.as_ref()],
        DelegateConfig::default(),
    )?;

    msg!("Batch A delegated");
    Ok(())
}

/// Delegate second batch: player_b_cards, pending_action, round_results
#[delegate]
#[derive(Accounts)]
pub struct DelegateMatchB<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: player_b_cards PDA
    #[account(mut, del)]
    pub player_b_cards: AccountInfo<'info>,

    /// CHECK: pending_action PDA
    #[account(mut, del)]
    pub pending_action: AccountInfo<'info>,

    /// CHECK: round_results PDA
    #[account(mut, del)]
    pub round_results: AccountInfo<'info>,
}

pub fn handler_b(ctx: Context<DelegateMatchB>, match_key: Pubkey, player_b: Pubkey) -> Result<()> {
    ctx.accounts.delegate_player_b_cards(
        &ctx.accounts.payer,
        &[b"cards", match_key.as_ref(), player_b.as_ref()],
        DelegateConfig::default(),
    )?;

    ctx.accounts.delegate_pending_action(
        &ctx.accounts.payer,
        &[b"action", match_key.as_ref()],
        DelegateConfig::default(),
    )?;

    ctx.accounts.delegate_round_results(
        &ctx.accounts.payer,
        &[b"results", match_key.as_ref()],
        DelegateConfig::default(),
    )?;

    msg!("Batch B delegated");
    Ok(())
}
