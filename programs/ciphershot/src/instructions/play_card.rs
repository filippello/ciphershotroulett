use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::CipherShotError;

#[derive(Accounts)]
pub struct PlayCard<'info> {
    #[account(mut)]
    pub responder: Signer<'info>,

    #[account(mut)]
    pub match_config: Account<'info, MatchConfig>,

    #[account(mut)]
    pub chamber: Account<'info, Chamber>,

    /// The responder's card inventory
    #[account(
        mut,
        constraint = responder_cards.owner == responder.key(),
    )]
    pub responder_cards: Account<'info, PlayerCards>,

    #[account(mut)]
    pub pending_action: Account<'info, PendingAction>,

    /// All round results (pre-created in create_match)
    #[account(
        mut,
        seeds = [b"results", match_config.key().as_ref()],
        bump,
    )]
    pub round_results: Account<'info, RoundResults>,
}

pub fn handler(ctx: Context<PlayCard>, card: u8) -> Result<()> {
    let match_config = &mut ctx.accounts.match_config;
    let chamber = &ctx.accounts.chamber;
    let responder_cards = &mut ctx.accounts.responder_cards;
    let round_results = &mut ctx.accounts.round_results;
    let responder_key = ctx.accounts.responder.key();

    require!(match_config.phase == Phase::RespondingCard, CipherShotError::InvalidPhase);
    require!(card <= 2, CipherShotError::InvalidCard);

    // Verify this is the responder (not the shooter)
    let is_responder = match_config.current_shooter != responder_key
        && (match_config.player_a == responder_key || match_config.player_b == responder_key);
    require!(is_responder, CipherShotError::NotResponder);

    // Validate and consume card
    match card {
        1 => {
            // Bluff
            require!(responder_cards.bluffs > 0, CipherShotError::NoCardsRemaining);
            responder_cards.bluffs -= 1;
        }
        2 => {
            // Redirect
            require!(responder_cards.redirects > 0, CipherShotError::NoCardsRemaining);
            responder_cards.redirects -= 1;
        }
        _ => {
            // Pass (0) — no card consumed
        }
    }

    // === Resolve shot ===
    let shot_index = match_config.current_shot_index as usize;
    require!(shot_index < 7, CipherShotError::ChamberExhausted);

    let is_live = chamber.rounds[shot_index] == 1;
    let selected_target = match_config.selected_target;

    // Determine final target considering redirect
    // Redirect flips the target: self→opponent, opponent→self
    // Bluff is a fake card — doesn't change target
    let final_target_value = if card == 2 {
        // Redirect: flip target
        if selected_target == 0 { 1 } else { 0 }
    } else {
        selected_target
    };

    // Map target value to actual player pubkey
    let shooter = match_config.current_shooter;
    let opponent = if shooter == match_config.player_a {
        match_config.player_b
    } else {
        match_config.player_a
    };

    let final_target_pubkey = if final_target_value == 0 {
        shooter // self
    } else {
        opponent // opponent
    };

    let killed = is_live;

    // Write round result into the combined account
    round_results.write_result(
        shot_index,
        shooter,
        final_target_pubkey,
        killed,
        card,
        match_config.current_shot_index,
    );

    // Update match state
    if killed {
        // Someone died
        if final_target_pubkey == match_config.player_a {
            match_config.player_a_alive = false;
        } else {
            match_config.player_b_alive = false;
        }

        // Winner is the other player
        match_config.winner = if final_target_pubkey == match_config.player_a {
            match_config.player_b
        } else {
            match_config.player_a
        };
        match_config.phase = Phase::GameOver;
    } else if match_config.current_shot_index + 1 >= 7 {
        // Chamber exhausted — draw
        match_config.phase = Phase::GameOver;
        match_config.winner = Pubkey::default();
    } else {
        // Advance: swap shooter, next shot
        match_config.current_shot_index += 1;
        match_config.current_shooter = if shooter == match_config.player_a {
            match_config.player_b
        } else {
            match_config.player_a
        };
        match_config.phase = Phase::ChoosingTarget;
        match_config.selected_target = 255;
    }

    msg!(
        "Shot resolved: index={} killed={} card={} final_target={}",
        shot_index,
        killed,
        card,
        final_target_pubkey,
    );

    Ok(())
}
