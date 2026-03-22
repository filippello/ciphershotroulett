use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::CipherShotError;

#[derive(Accounts)]
pub struct ChooseTarget<'info> {
    pub shooter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"match", match_config.match_id.as_ref()],
        bump = match_config.bump,
        // Note: match_id is stored as key bytes in create_match, so we use
        // a simpler constraint here
    )]
    pub match_config: Account<'info, MatchConfig>,
}

pub fn handler(ctx: Context<ChooseTarget>, target: u8) -> Result<()> {
    let match_config = &mut ctx.accounts.match_config;
    let shooter = ctx.accounts.shooter.key();

    require!(match_config.phase == Phase::ChoosingTarget, CipherShotError::InvalidPhase);
    require!(match_config.current_shooter == shooter, CipherShotError::NotShooter);
    require!(target <= 1, CipherShotError::InvalidTarget);

    match_config.selected_target = target;
    match_config.phase = Phase::RespondingCard;

    msg!("Target chosen: {} by {}", target, shooter);
    Ok(())
}
