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
async function fetchMyPicks(gameweek, teamIdToUse) {
  if (!teamIdToUse || !FPL_SESSION) {
    console.log(
      "FPL Team ID from UI/env or FPL_SESSION not set. Skipping fetchMyPicks."
    );
    return null;
  }
  const url = `${FPL_BASE_URL}/entry/${teamIdToUse}/event/${gameweek}/picks/`;
  const options = {
    headers: {
      Cookie: `sessionid=${FPL_SESSION}`, // Corrected cookie format for FPL
    },
  };
  console.log(
    `Fetching user picks for GW ${gameweek} (Team ID: ${teamIdToUse}) from:`,
    url
  );
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

// Modified prompt for JSON output
function constructOpenAIPromptForJSON(
  userContext,
  fplGeneralSummary,
  manualFreeTransfers
) {
  // Use manualFreeTransfers if provided, otherwise default or indicate it needs inferring by AI (though we prefer user input now)
  const ftForPrompt =
    manualFreeTransfers !== null && manualFreeTransfers !== undefined
      ? manualFreeTransfers
      : "Not specified by user; assume 1 FT if unsure, but confirm with user if critical.";

  // This is the general instruction and context.
  // The key is to also tell the model to respond in JSON format with specific keys.
  const instruction = `You are an expert Fantasy Premier League (FPL) assistant. Your goal is to provide the best possible advice for the upcoming gameweek.
Use all the provided context extensively.

The user has indicated they have "${ftForPrompt}" free transfers available for the *next* gameweek you are advising on.
The "Transfers Made This Gameweek" field in the user context refers to transfers made in the *current or most recently completed* gameweek.

Respond with a JSON object containing the following keys:
- "promisingTeamsNextGW": (string) Based on the "Upcoming Fixtures (Next GW)" data, identify 2-3 teams that have the most favorable fixtures and are likely to score well (e.g., high chance of goals, clean sheets). Briefly explain your reasoning for each team, considering home/away advantage and fixture difficulty ratings.
- "transferStrategy": (string) Detailed transfer advice. Suggest specific players to TRANSFER OUT from the "Current Squad" and specific players to TRANSFER IN. **All players suggested for transfer IN must be actual FPL players with a listed FPL position (Goalkeeper, Defender, Midfielder, Forward); do not suggest managers or other non-player personnel.** Justify transfer-in suggestions with strong reasoning based on individual player form (refer to "Sample of Top Performing Players" if relevant), ICT index, expected stats, value for money, and upcoming fixture difficulty. Prioritize players from teams that are generally strong or in good form. Avoid suggesting players from poorly performing teams based solely on one easy fixture, unless the player is an exceptional individual talent. Consider "Promising Teams (Next GW)" but weigh it against overall team/player quality. Base your strategy on the user-provided free transfers: ${ftForPrompt}. If no transfers are urgent, state that and advise rolling a transfer.
- "captainPicks": (string) Captain and vice-captain nominations with justifications. Ensure these are players from the user's squad (after any recommended transfers).
- "startingLineup": (string) From the user's "Current Squad" (after considering your "Transfer Strategy" recommendations if any transfers IN are made), recommend the optimal starting 11 players. **All players listed must be from the user's squad list (potentially modified by your transfer suggestions) and must be actual FPL players with known FPL positions, not managers or other non-player personnel.** List the 11 player names.
- "benchOrder": (string) Recommended bench order from the remaining players in the user's squad (after transfers and starting 11 selection).
- "chipStrategy": (string) Advice on chip usage for the next gameweek.
- "playersToWatch": (string) 1-2 players (actual FPL players) to watch for future gameweeks.

Ensure the content for each key is a descriptive string.
`;

  const fplDataContext = `
## User's FPL Team Context:
- Current Squad: ${JSON.stringify(userContext.team_picks, null, 2)}
- Money in Bank: £${userContext.bank}m
- Transfers Made This Gameweek (in current/past GW): ${
    userContext.transfers_made_this_gw
  } 
- Free Transfers Available (for NEXT GW, user-provided): ${ftForPrompt}
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
`;
  return instruction + fplDataContext;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const manualFreeTransfersInput = searchParams.get("freeTransfers");
    const teamIdFromUI = searchParams.get("teamId");

    // Determine which Team ID to use: UI input or fallback to environment variable
    const teamIdToUse = teamIdFromUI || FPL_TEAM_ID;

    console.log(
      `--- Starting FPL Advisor API Call (Team ID: ${teamIdToUse}, User FTs: ${manualFreeTransfersInput}) ---`
    );
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
    if (!teamIdToUse) {
      return NextResponse.json(
        { error: "FPL Team ID not configured or provided." },
        { status: 500 }
      );
    }
    if (!FPL_SESSION) {
      return NextResponse.json(
        { error: "FPL Session ID not configured." },
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

    const myPicksRaw = await fetchMyPicks(currentGameweekId, teamIdToUse);
    let aiSuggestionObject = null; // Will store the parsed JSON object

    if (myPicksRaw) {
      const userFPLContext = buildUserFPLContext(myPicksRaw, bootstrapData);
      const fplGeneralSummary = buildFPLGeneralSummary(
        bootstrapData,
        allFixturesData,
        nextGameweekId
      );

      // Pass manualFreeTransfersInput to the prompt constructor
      const prompt = constructOpenAIPromptForJSON(
        userFPLContext,
        fplGeneralSummary,
        manualFreeTransfersInput
      );

      console.log(
        "Sending request to OpenAI (with refined player selection instructions)..."
      );
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125", // Ensure this model supports JSON mode
        messages: [
          // The instruction for JSON output is now part of the user prompt
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }, // Enable JSON mode
      });

      const messageContent = completion.choices[0].message.content;
      if (messageContent) {
        try {
          aiSuggestionObject = JSON.parse(messageContent);
          console.log("Received and parsed JSON suggestion from OpenAI.");
        } catch (e) {
          console.error("Failed to parse JSON response from OpenAI:", e);
          console.error("OpenAI raw response:", messageContent);
          aiSuggestionObject = {
            error:
              "Failed to parse AI response. The AI did not return valid JSON.",
            rawResponse: messageContent,
          };
        }
      } else {
        aiSuggestionObject = { error: "OpenAI returned an empty message." };
      }
    } else {
      aiSuggestionObject = {
        error: `Cannot provide personalized FPL advice. FPL User data not available for Team ID: ${teamIdToUse}. Ensure FPL_SESSION is valid.`,
        promisingTeamsNextGW: "N/A - General data not available.",
        transferStrategy: "N/A - User data not available.",
        captainPicks: "N/A - User data not available.",
        startingLineup: "N/A - User data not available.",
        benchOrder: "N/A - User data not available.",
        chipStrategy: "N/A - User data not available.",
        playersToWatch: "N/A - User data not available.",
      };
      console.log(
        "User picks not available, returning default JSON structure."
      );
    }

    return NextResponse.json({
      message: "FPL Advisor API request processed.",
      currentGameweek: currentGameweekId,
      nextGameweekForAdvice: nextGameweekId,
      teamIdUsed: teamIdToUse,
      aiStructuredSuggestion: aiSuggestionObject, // Send the object directly
    });
  } catch (error) {
    console.error("Error in FPL Advisor API:", error.message, error.stack);
    // Ensure a default error structure if aiSuggestionObject wasn't set
    const errorResponse = aiSuggestionObject || {
      error: error.message || "An internal server error occurred",
    };
    return NextResponse.json(
      {
        error: error.message || "An internal server error occurred",
        aiStructuredSuggestion: errorResponse, // Send a structured error
      },
      { status: 500 }
    );
  }
}
