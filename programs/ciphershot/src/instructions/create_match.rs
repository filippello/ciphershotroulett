use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = MatchConfig::SIZE,
        seeds = [b"match", match_id.as_ref()],
        bump,
    )]
    pub match_config: Account<'info, MatchConfig>,

    #[account(
        init,
        payer = payer,
        space = Chamber::SIZE,
        seeds = [b"chamber", match_config.key().as_ref()],
        bump,
    )]
    pub chamber: Account<'info, Chamber>,

    /// CHECK: Player A pubkey, validated by server
    pub player_a: UncheckedAccount<'info>,

    /// CHECK: Player B pubkey, validated by server
    pub player_b: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = PlayerCards::SIZE,
        seeds = [b"cards", match_config.key().as_ref(), player_a.key().as_ref()],
        bump,
    )]
    pub player_a_cards: Account<'info, PlayerCards>,

    #[account(
        init,
        payer = payer,
        space = PlayerCards::SIZE,
        seeds = [b"cards", match_config.key().as_ref(), player_b.key().as_ref()],
        bump,
    )]
    pub player_b_cards: Account<'info, PlayerCards>,

    #[account(
        init,
        payer = payer,
        space = PendingAction::SIZE,
        seeds = [b"action", match_config.key().as_ref()],
        bump,
    )]
    pub pending_action: Account<'info, PendingAction>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateMatch>, match_id: [u8; 32]) -> Result<()> {
    let match_config = &mut ctx.accounts.match_config;
    let chamber = &mut ctx.accounts.chamber;
    let player_a_cards = &mut ctx.accounts.player_a_cards;
    let player_b_cards = &mut ctx.accounts.player_b_cards;
    let pending_action = &mut ctx.accounts.pending_action;

    let player_a = ctx.accounts.player_a.key();
    let player_b = ctx.accounts.player_b.key();

    // Initialize match config
    match_config.match_id = match_id;
    match_config.player_a = player_a;
    match_config.player_b = player_b;
    match_config.current_shooter = player_a; // Player A shoots first
    match_config.phase = Phase::ChoosingTarget;
    match_config.current_shot_index = 0;
    match_config.selected_target = 255; // unset
    match_config.player_a_alive = true;
    match_config.player_b_alive = true;
    match_config.winner = Pubkey::default();
    match_config.bump = ctx.bumps.match_config;

    // Generate shuffled chamber: 3 live (1) + 4 blank (0)
    // Fisher-Yates shuffle using Clock as entropy source inside TEE
    let mut rounds: [u8; 7] = [1, 1, 1, 0, 0, 0, 0];
    let clock = Clock::get()?;
    let mut seed = clock.unix_timestamp as u64;
    // Mix in slot for additional entropy (inside TEE this is private)
    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(clock.slot);

    for i in (1..7).rev() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let j = (seed % (i as u64 + 1)) as usize;
        rounds.swap(i, j);
    }

    chamber.rounds = rounds;
    chamber.bump = ctx.bumps.chamber;

    // Initialize player cards: 3 bluffs + 2 redirects each
    player_a_cards.owner = player_a;
    player_a_cards.bluffs = 3;
    player_a_cards.redirects = 2;
    player_a_cards.bump = ctx.bumps.player_a_cards;

    player_b_cards.owner = player_b;
    player_b_cards.bluffs = 3;
    player_b_cards.redirects = 2;
    player_b_cards.bump = ctx.bumps.player_b_cards;

    // Initialize pending action
    pending_action.card_played = 0;
    pending_action.bump = ctx.bumps.pending_action;

    msg!("Match created: {} vs {}", player_a, player_b);
    Ok(())
}
