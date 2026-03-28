Findings

  The failure is most likely in @tailuge/messaging, with one app-level integration
  consequence.

  The count on /game comes entirely from users.length in src/pages/game.tsx:23, and
  that users array is driven by the Lobby instance stored in src/contexts/
  MessagingContext.tsx:69 and joined in src/contexts/MessagingContext.tsx:161.

  The root cause chain is:

  1. Leaving the lobby page triggers the messaging library’s pagehide handler.
     In node_modules/@tailuge/messaging/dist/messagingclient.js:18, pagehide calls
     stop({ isTeardown: true }).
  2. stop() tears down the current lobby object and removes it from the client.
     In node_modules/@tailuge/messaging/dist/messagingclient.js:57, activeLobbies is
     cleared and lobby.leave() is called.
  3. Lobby.leave() clears the lobby’s in-memory user map and immediately notifies
     listeners.
     In node_modules/@tailuge/messaging/dist/lobby.js:232, it clears this.users and
     calls notifyListeners(). Because the app is still subscribed via onUsersChange,
     MessagingContext receives [] and sets React state to empty in src/contexts/
     MessagingContext.tsx:103. That explains the 0 count you see right after coming
     back.
  4. On back navigation, the library recreates a new Lobby internally, but the app
     still points at the old one.
     In node_modules/@tailuge/messaging/dist/messagingclient.js:150, resumeSession()
     re-joins from saved config, which goes back through joinLobby() and constructs
     a new Lobby object in node_modules/@tailuge/messaging/dist/
     messagingclient.js:103.
  5. MessagingProvider never re-runs its join effect on resume because userId and
     userName did not change.
     So src/contexts/MessagingContext.tsx:191 never gets a new lobby reference,
     never reattaches onUsersChange, and keeps using the stale pre-navigation
     lobbyRef.current. Identity still appears correct because that state is separate
     in UserContext and session storage.

  That means the main defect is a library lifecycle/API bug:
  MessagingClient.resumeSession() can replace Lobby instances behind the consumer’s
  back, but the consumer API is instance-based. After resume, the previously
  returned Lobby object is stale.

  Why this points to the library, not primarily app wiring

  The library spec explicitly says MessagingClient owns pagehide/pageshow
  restoration in node_modules/@tailuge/messaging/MESSAGING_SPEC.md:370. Given that
  contract, a consumer holding the returned Lobby should not silently lose updates
  after resume. The current implementation violates that expectation by recreating
  the lobby instance internally without surfacing it.

  The app does have an integration fragility: it stores a single lobbyRef and
  assumes the Lobby object remains valid for the session. That assumption is
  reasonable with the current public API, but it becomes unsafe because of the
  library’s hidden rejoin behavior.

  Recommended issue report

  Report against @tailuge/messaging:

  - pagehide -> stop() clears the current lobby and emits an empty users list.
  - resumeSession() re-joins by creating a new Lobby instance.
  - Consumers that retain the original Lobby object never receive updates after
    bfcache/history restore.
  - Result: local presence count remains 0 after browser back, while identity/
    session state is intact.

  Approaches to resolve

  Preferred fix in @tailuge/messaging:

  - Preserve Lobby object identity across lifecycle resume.
  - Recreate the subscription inside the existing Lobby instance instead of
    constructing a new one.
  - Keep listeners attached, then call syncPresence() after reconnect/resume.

