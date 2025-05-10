"use client";

import { useState } from "react";

export default function FPLAdvisorClient() {
  const [advice, setAdvice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAdvice = async () => {
    setIsLoading(true);
    setError(null);
    setAdvice(null);
    try {
      const response = await fetch("/api/advise");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `API request failed with status ${response.status}`
        );
      }
      const data = await response.json();
      setAdvice(data);
    } catch (err) {
      console.error("Failed to fetch advice:", err);
      setError(err.message);
    }
    setIsLoading(false);
  };

  return (
    <div className="text-center">
      <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-gray-800 dark:text-white">
        FPL Advisor
      </h1>
      <button
        onClick={fetchAdvice}
        disabled={isLoading}
        className={`
          px-6 py-3 sm:px-8 sm:py-4
          text-lg sm:text-xl font-semibold 
          text-white
          bg-gradient-to-r from-blue-500 to-indigo-600 
          hover:from-blue-600 hover:to-indigo-700 
          dark:from-blue-400 dark:to-indigo-500
          dark:hover:from-blue-500 dark:hover:to-indigo-600
          rounded-lg 
          shadow-lg 
          hover:shadow-xl 
          cursor-pointer
          focus:outline-none 
          focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800
          transform transition-all duration-150 ease-in-out
          hover:scale-105 
          active:scale-95
          disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none
        `}
      >
        {isLoading ? "Getting Advice..." : "Advise on Next Gameweek"}
      </button>

      {error && (
        <div
          className="mt-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      {advice && advice.aiSuggestion && (
        <div className="mt-8 p-6 bg-white dark:bg-gray-800 shadow-xl rounded-lg text-left max-w-2xl mx-auto">
          <pre
            className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-700 p-4 rounded-md text-gray-700 dark:text-gray-300 text-sm"
            style={{ fontFamily: "monospace" }}
          >
            {advice.aiSuggestion}
          </pre>
          {advice.currentGameweek && (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Advice for Gameweek: {advice.currentGameweek}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
