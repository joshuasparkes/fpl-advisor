"use client";

import { useState } from "react";
import Image from "next/image"; // Import the Next.js Image component

// Reusable Card component - This can remain largely the same
// but will receive content directly from the parsed JSON.
function AdviceSectionCard({ title, content }) {
  if (
    !content ||
    content.startsWith("N/A -") ||
    content.includes("not found")
  ) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 mb-6 w-full">
        <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-200">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 italic">
          No specific advice provided or data unavailable for this section.
        </p>
      </div>
    );
  }

  const formattedContent = content.split("\n").map((line, index) => (
    <span key={index}>
      {line}
      <br />
    </span>
  ));

  return (
    <div className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 mb-6 w-full">
      <h3 className="text-2xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">
        {title}
      </h3>
      <div className="prose prose-sm sm:prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
        <p>{formattedContent}</p>
      </div>
    </div>
  );
}

export default function FPLAdvisorClient() {
  const [structuredAdvice, setStructuredAdvice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiMeta, setApiMeta] = useState(null);
  const [manualFreeTransfers, setManualFreeTransfers] = useState("1"); // Default to '1'
  const [teamId, setTeamId] = useState("5253307"); // Default Team ID

  const fetchAdvice = async () => {
    setIsLoading(true);
    setError(null);
    setStructuredAdvice(null);
    setApiMeta(null);
    try {
      const apiUrl = new URL("/api/advise", window.location.origin);
      // Add manualFreeTransfers as a query parameter if it's a valid number
      const ftValue = parseInt(manualFreeTransfers);
      if (!isNaN(ftValue) && ftValue >= 0) {
        apiUrl.searchParams.append("freeTransfers", manualFreeTransfers);
      } else {
        // Optionally handle invalid input, or let the backend decide a default
        console.warn(
          "Manual free transfers input is invalid, not sending parameter."
        );
      }

      // Add teamId as a query parameter
      if (teamId.trim() !== "") {
        apiUrl.searchParams.append("teamId", teamId.trim());
      }

      const response = await fetch(apiUrl.toString());
      const data = await response.json();

      if (!response.ok) {
        // Use error from API response if available, otherwise a generic one
        throw new Error(
          data.error || `API request failed with status ${response.status}`
        );
      }

      setApiMeta({
        currentGameweek: data.currentGameweek,
        nextGameweekForAdvice: data.nextGameweekForAdvice,
      });

      if (data.aiStructuredSuggestion) {
        if (data.aiStructuredSuggestion.error) {
          // If the structured suggestion itself contains an error field (e.g., parsing failed)
          setError(
            data.aiStructuredSuggestion.error +
              (data.aiStructuredSuggestion.rawResponse
                ? ` Raw: ${data.aiStructuredSuggestion.rawResponse}`
                : "")
          );
          setStructuredAdvice(null); // Clear any potentially misleading partial advice
        } else {
          setStructuredAdvice(data.aiStructuredSuggestion);
        }
      } else {
        setError("AI suggestion not found in the API response.");
        setStructuredAdvice(null);
      }
    } catch (err) {
      console.error("Failed to fetch advice:", err);
      setError(err.message);
      setStructuredAdvice(null);
    }
    setIsLoading(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        {/* Logo Display */}
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo2.png" // Path to your logo in the public folder
            alt="FPL Advisor Logo"
            width={100} // Adjust size as needed
            height={100} // Adjust size as needed
            className={`
              rounded-full 
              shadow-lg
              ${isLoading ? "animate-spin" : ""}
            `}
            priority // Optional: if logo is above the fold
          />
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold mb-6 text-gray-800 dark:text-white">
          FPL Advisor
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 max-w-md mx-auto">
          <div>
            <label
              htmlFor="teamId"
              className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              FPL Team ID:
            </label>
            <input
              type="text" // Changed to text to allow leading zeros if any, though FPL IDs are numbers
              id="teamId"
              name="teamId"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="mt-1 block w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm text-center text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., 5253307"
            />
          </div>
          <div>
            <label
              htmlFor="freeTransfers"
              className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Free Transfers
            </label>
            <input
              type="number"
              id="freeTransfers"
              name="freeTransfers"
              value={manualFreeTransfers}
              onChange={(e) => setManualFreeTransfers(e.target.value)}
              min="0"
              max="15"
              className="mt-1 block w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm text-center text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={fetchAdvice}
          disabled={isLoading}
          className={`
            px-8 py-4 sm:px-10 sm:py-5
            text-xl sm:text-2xl font-semibold 
            text-white
            bg-gradient-to-r from-blue-500 to-indigo-600 
            hover:from-blue-600 hover:to-indigo-700 
            dark:from-blue-400 dark:to-indigo-500
            dark:hover:from-blue-500 dark:hover:to-indigo-600
            rounded-xl 
            shadow-lg 
            hover:shadow-xl 
            cursor-pointer
            focus:outline-none 
            focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800
            transform transition-all duration-150 ease-in-out
            hover:scale-105 
            active:scale-95
            disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none
            flex items-center justify-center mx-auto  // For centering icon and text if button content changes
          `}
        >
          {isLoading && ( // Show spinner inside button ONLY if you want it there instead of main logo
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}
          {isLoading ? "Getting Advice..." : "Advise on Next Gameweek"}
        </button>
      </div>

      {error && (
        <div
          className="mt-8 p-5 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md shadow-md dark:bg-red-900 dark:text-red-200 dark:border-red-700"
          role="alert"
        >
          <strong className="font-bold block text-lg">Error:</strong>
          <span className="block mt-1 whitespace-pre-wrap">{error}</span>{" "}
          {/* Allow error to wrap */}
        </div>
      )}

      {structuredAdvice && !error && !isLoading && (
        <div className="mt-10 space-y-8">
          {apiMeta?.currentGameweek && (
            <div className="text-center mb-8 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg shadow">
              <p className="text-lg text-gray-700 dark:text-gray-300">
                Advice for{" "}
                <strong>
                  Gameweek{" "}
                  {apiMeta.nextGameweekForAdvice || apiMeta.currentGameweek}
                </strong>{" "}
                (Current GW: {apiMeta.currentGameweek}).
              </p>
              {/* Display user-provided FTs if they were used (or inferred by AI if we kept that field) */}
              {manualFreeTransfers !== "" &&
                !isNaN(parseInt(manualFreeTransfers)) && (
                  <p className="text-md text-blue-600 dark:text-blue-400 font-semibold mt-1">
                    Using {manualFreeTransfers} Free Transfer(s) as provided.
                  </p>
                )}
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Team ID: {teamId}
              </p>
            </div>
          )}
          {/* New Card for Promising Teams */}
          <AdviceSectionCard
            title="Promising Teams (Next GW)"
            content={structuredAdvice.promisingTeamsNextGW}
          />
          <AdviceSectionCard
            title="Transfer Strategy"
            content={structuredAdvice.transferStrategy}
          />
          <AdviceSectionCard
            title="Captain and Vice-Captain"
            content={structuredAdvice.captainPicks}
          />
          <AdviceSectionCard
            title="Starting Lineup"
            content={structuredAdvice.startingLineup}
          />
          <AdviceSectionCard
            title="Bench Order"
            content={structuredAdvice.benchOrder}
          />
          <AdviceSectionCard
            title="Chip Strategy"
            content={structuredAdvice.chipStrategy}
          />
          <AdviceSectionCard
            title="Players to Watch"
            content={structuredAdvice.playersToWatch}
          />
        </div>
      )}
    </div>
  );
}
