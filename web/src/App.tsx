import { AiAssistantPage } from "./pages/AiAssistantPage";
import { AppLayout } from "./layout/AppLayout";
import { DuplicateReviewPage } from "./pages/DuplicateReviewPage";
import { LoginPage } from "./pages/LoginPage";
import { LibraryPage } from "./pages/LibraryPage";
import { RecommendationPage } from "./pages/RecommendationPage";
import { TagsPage } from "./pages/TagsPage";
import { TrackDetailPage } from "./pages/TrackDetailPage";
import { UploadPage } from "./pages/UploadPage";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RouteLink } from "./routes/RouteLink";
import { getRoute, navigateTo, useCurrentPath } from "./routes/router";

export default function App() {
  const path = useCurrentPath();
  const route = getRoute(path);

  const isAuthenticated =
    window.localStorage.getItem("easy-music-web-placeholder-auth") === "true";

  const setPlaceholderAuth = (nextValue: boolean) => {
    if (nextValue) {
      window.localStorage.setItem("easy-music-web-placeholder-auth", "true");
      navigateTo("/library");
      return;
    }

    window.localStorage.removeItem("easy-music-web-placeholder-auth");
    navigateTo("/login");
  };

  if (route.name === "login") {
    return (
      <LoginPage
        isAuthenticated={isAuthenticated}
        onUsePlaceholderSession={() => setPlaceholderAuth(true)}
      />
    );
  }

  return (
    <ProtectedRoute
      isAuthenticated={isAuthenticated}
      onUsePlaceholderSession={() => setPlaceholderAuth(true)}
    >
      <AppLayout onSignOut={() => setPlaceholderAuth(false)}>
        {route.name === "library" ? <LibraryPage /> : null}
        {route.name === "duplicates" ? <DuplicateReviewPage /> : null}
        {route.name === "upload" ? <UploadPage /> : null}
        {route.name === "tags" ? <TagsPage /> : null}
        {route.name === "aiAssistant" ? <AiAssistantPage /> : null}
        {route.name === "recommendations" ? <RecommendationPage /> : null}
        {route.name === "trackDetail" ? (
          <TrackDetailPage trackId={route.params.trackId} />
        ) : null}
        {route.name === "notFound" ? (
          <section className="page-panel">
            <p className="eyebrow">Not found</p>
            <h1>Page unavailable</h1>
            <p className="page-copy">
              This route is not part of the Phase 2 Web console.
            </p>
            <RouteLink className="button primary" to="/library">
              Go to library
            </RouteLink>
          </section>
        ) : null}
      </AppLayout>
    </ProtectedRoute>
  );
}
