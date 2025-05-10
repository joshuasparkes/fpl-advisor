// app/api/advise/route.js
import { NextResponse } from "next/server";
import OpenAI from "openai";

const FPL_BASE_URL = process.env.FPL_BASE_URL;
const FPL_TEAM_ID = process.env.FPL_TEAM_ID;
const FPL_SESSION = process.env.FPL_SESSION;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

// Helper function to fetch data (equivalent to requests.get in Python)
async function fetchData(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        `API Error for ${url}: ${response.status} ${response.statusText}`,
        errorData
      );
      throw new Error(
        `API request failed with status ${response.status}: ${errorData}`
      );
    }
    return await response.json();
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error);
    throw error;
  }
}

// 1. Fetch Bootstrap Data (equivalent to fetch_bootstrap in Python)
async function fetchBootstrap() {
  const url = `${FPL_BASE_URL}/bootstrap-static/`;
  console.log("Fetching bootstrap data from:", url);
  return await fetchData(url);
}

// 2. Fetch All Fixtures (equivalent to fetch_all_fixtures in Python)
async function fetchAllFixtures() {
  const url = `${FPL_BASE_URL}/fixtures/`;
  console.log("Fetching fixtures data from:", url);
  return await fetchData(url);
}

// 3. Fetch User's Picks (equivalent to fetch_my_picks in Python)
async function fetchMyPicks(gameweek) {
  if (!FPL_TEAM_ID || !FPL_SESSION) {
    console.log("FPL_TEAM_ID or FPL_SESSION not set. Skipping fetchMyPicks.");
    return null;
  }
  const url = `${FPL_BASE_URL}/entry/${FPL_TEAM_ID}/event/${gameweek}/picks/`;
  const options = {
    headers: {
      Cookie: `sessionid=${FPL_SESSION}`, // Corrected cookie format for FPL
    },
  };
  console.log(`Fetching user picks for GW ${gameweek} from:`, url);
  return await fetchData(url, options);
}

function buildUserFPLContext(myPicksRaw, bootstrapData) {
  const playerMap = new Map(bootstrapData.elements.map((p) => [p.id, p]));
  const teamMap = new Map(bootstrapData.teams.map((t) => [t.id, t]));

  const enhancedPicksList = myPicksRaw.picks.map((pick) => {
    const playerInfo = playerMap.get(pick.element) || {};
    const teamInfo = teamMap.get(playerInfo.team) || {};
    return {
      position: pick.position,
      player_id: pick.element,
      name: playerInfo.web_name || "Unknown",
      team_name: teamInfo.name || "Unknown Team",
      is_captain: pick.is_captain,
      is_vice_captain: pick.is_vice_captain,
      cost: (playerInfo.now_cost || 0) / 10.0,
      form: playerInfo.form || "0",
      points_per_game: playerInfo.points_per_game || "0",
      total_points: playerInfo.total_points || 0,
      selected_by_percent: playerInfo.selected_by_percent || "0",
      chance_of_playing_next_round:
        playerInfo.chance_of_playing_next_round ?? 100,
      minutes: playerInfo.minutes || 0,
      starts: playerInfo.starts || 0,
      bps: playerInfo.bps || 0,
      influence: playerInfo.influence || "0",
      creativity: playerInfo.creativity || "0",
      threat: playerInfo.threat || "0",
      ict_index: playerInfo.ict_index || "0",
      expected_goals: playerInfo.expected_goals ?? "N/A",
      expected_assists: playerInfo.expected_assists ?? "N/A",
      expected_goal_involvements:
        playerInfo.expected_goal_involvements ?? "N/A",
    };
  });

  return {
    team_picks: enhancedPicksList,
    bank: (myPicksRaw.entry_history?.bank || 0) / 10.0,
    transfers_made_this_gw: myPicksRaw.entry_history?.event_transfers || 0,
    active_chip: myPicksRaw.active_chip || null,
    available_chips: (myPicksRaw.chips || [])
      .filter((chip) => chip.status_for_event === "available")
      .map((chip) => chip.name),
  };
}

function buildFPLGeneralSummary(
  bootstrapData,
  allFixturesData,
  nextGameweekId
) {
  const teamMap = new Map(bootstrapData.teams.map((t) => [t.id, t]));

  const upcomingFixturesDetails = [];
  if (nextGameweekId) {
    for (const fixture of allFixturesData) {
      if (fixture.event === nextGameweekId) {
        const homeTeam = teamMap.get(fixture.team_h);
        const awayTeam = teamMap.get(fixture.team_a);
        upcomingFixturesDetails.push({
          kickoff_time: fixture.kickoff_time,
          home_team: homeTeam?.name || "Unknown Team",
          away_team: awayTeam?.name || "Unknown Team",
          home_difficulty: fixture.team_h_difficulty,
          away_difficulty: fixture.team_a_difficulty,
        });
      }
    }
  }

  const topFormPlayersRaw = [...bootstrapData.elements] // Create a copy to sort
    .sort((a, b) => parseFloat(b.form || 0) - parseFloat(a.form || 0))
    .slice(0, 10);

  const topPlayersSummary = topFormPlayersRaw.map((p_info) => {
    const teamInfo = teamMap.get(p_info.team);
    return {
      name: p_info.web_name || "Unknown",
      team_name: teamInfo?.name || "Unknown Team",
      cost: (p_info.now_cost || 0) / 10.0,
      form: p_info.form || "0",
      ict_index: p_info.ict_index || "0",
      total_points: p_info.total_points || 0,
      expected_goal_involvements: p_info.expected_goal_involvements ?? "N/A",
    };
  });

  return {
    next_gameweek_id: nextGameweekId,
    upcoming_fixtures_next_gw: upcomingFixturesDetails,
    top_performing_players_sample: topPlayersSummary,
  };
}

function constructOpenAIPrompt(userContext, fplGeneralSummary) {
  const transfersMade = userContext.transfers_made_this_gw || 0;
  const freeTransfersAvailable = transfersMade === 0 ? 1 : 0; // Simplified

  // Using template literals for a multi-line string
  return `You are an expert Fantasy Premier League (FPL) assistant. Your goal is to provide the best possible advice for the upcoming gameweek. Use all the provided context extensively.

## User's FPL Team Context:
- Current Squad: ${JSON.stringify(userContext.team_picks, null, 2)}
- Money in Bank: £${userContext.bank}m
- Transfers Made This Gameweek: ${userContext.transfers_made_this_gw}
- (Simplified) Free Transfers Available: ${freeTransfersAvailable}
- Active Chip for Current GW: ${userContext.active_chip || "None"}
- Available Chips for Future Use: ${
    userContext.available_chips.join(", ") || "None"
  }

## General FPL Data Summary (for next Gameweek):
- Next Gameweek ID: ${fplGeneralSummary.next_gameweek_id || "N/A"}
- Upcoming Fixtures (Next GW): ${JSON.stringify(
    fplGeneralSummary.upcoming_fixtures_next_gw,
    null,
    2
  )}
- Sample of Top Performing Players (League-wide): ${JSON.stringify(
    fplGeneralSummary.top_performing_players_sample,
    null,
    2
  )}

## Your Task:
Based on *all* the above information, provide comprehensive advice for the next gameweek, including:
1.  **Transfer Strategy**: 
    *   Suggest specific player(s) to TRANSFER OUT from the user's current squad.
    *   Suggest specific player(s) to TRANSFER IN. Justify with form, ICT, expected stats, upcoming fixtures (both individual and team), and value. Consider the number of free transfers.
    *   If no transfers are urgent, state that and advise rolling a transfer if applicable.
2.  **Captain and Vice-Captain**: Nominate a Captain and Vice-Captain from the user's squad for the next gameweek. Justify with strong reasoning based on form, fixture difficulty, and potential for high returns.
3.  **Starting Lineup (11 players)**: Recommend the optimal starting lineup from the user's squad.
4.  **Bench Order (remaining players)**: Recommend the bench order.
5.  **Chip Strategy**: If one of the 'Available Chips' (${
    userContext.available_chips.join(", ") || "None"
  }) seems highly advantageous for the *next* gameweek given the fixtures and team status, recommend its use and explain why. Otherwise, advise saving chips.
6.  **Players to Watch**: Briefly mention 1-2 players (not necessarily for immediate transfer) the user should keep an eye on for future gameweeks based on form or fixture swings.

Respond in a clear, structured format. Be specific with player names. Explain your reasoning thoroughly for each recommendation.`;
}

export async function GET(request) {
  try {
    console.log("--- Starting FPL Advisor API Call ---");
    if (!OPENAI_API_KEY || !openai) {
      return NextResponse.json(
        { error: "OpenAI API key not configured." },
        { status: 500 }
      );
    }
    if (!FPL_BASE_URL) {
      return NextResponse.json(
        { error: "FPL Base URL not configured." },
        { status: 500 }
      );
    }

    const bootstrapData = await fetchBootstrap();
    const allFixturesData = await fetchAllFixtures();

    const currentEvent = bootstrapData.events.find((event) => event.is_current);
    const nextEvent = bootstrapData.events.find((event) => event.is_next);

    if (!currentEvent) {
      return NextResponse.json(
        { error: "Could not determine current gameweek." },
        { status: 500 }
      );
    }
    if (!nextEvent) {
      // This might be end of season, or API data issue.
      // For now, we'll proceed using current GW for next if next is not found,
      // but ideally, this scenario should be handled more gracefully.
      console.warn(
        "Could not determine next gameweek. Using current gameweek for planning."
      );
    }
    const currentGameweekId = currentEvent.id;
    const nextGameweekId = nextEvent ? nextEvent.id : currentGameweekId; // Fallback for next GW ID

    console.log("Current Gameweek ID:", currentGameweekId);
    console.log("Next Gameweek ID for planning:", nextGameweekId);

    const myPicksRaw = await fetchMyPicks(currentGameweekId);

    let aiSuggestionText;

    if (myPicksRaw) {
      const userFPLContext = buildUserFPLContext(myPicksRaw, bootstrapData);
      const fplGeneralSummary = buildFPLGeneralSummary(
        bootstrapData,
        allFixturesData,
        nextGameweekId
      );
      const prompt = constructOpenAIPrompt(userFPLContext, fplGeneralSummary);

      // console.log("--- Constructed OpenAI Prompt ---");
      // console.log(prompt); // For debugging the prompt

      console.log("Sending request to OpenAI...");
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Or your preferred model
        messages: [
          {
            role: "system",
            content:
              "You are an expert FPL assistant. Provide clear, actionable advice.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });
      aiSuggestionText = completion.choices[0].message.content;
      console.log("Received suggestion from OpenAI.");
    } else {
      aiSuggestionText =
        "Cannot provide personalized FPL advice. Please ensure FPL_TEAM_ID and FPL_SESSION environment variables are correctly set and your FPL team is accessible.";
      console.log("User picks not available, returning default message.");
    }

    return NextResponse.json({
      message: "FPL Advisor API request processed.",
      currentGameweek: currentGameweekId,
      nextGameweekForAdvice: nextGameweekId,
      aiSuggestion: aiSuggestionText,
    });
  } catch (error) {
    console.error("Error in FPL Advisor API:", error.message, error.stack);
    return NextResponse.json(
      { error: error.message || "An internal server error occurred" },
      { status: 500 }
    );
  }
}
