import { useEffect } from "react";

import { useAuth } from "./auth/AuthProvider";
import { ConfirmProvider } from "./components/ui/Dialog";
import { EmptyState } from "./components/ui/common";
import { ToastProvider } from "./components/ui/Toast";
import { AppLayout } from "./layout/AppLayout";
import { AiAssistantPage } from "./pages/AiAssistantPage";
import { DuplicateReviewPage } from "./pages/DuplicateReviewPage";
import { ImportPage } from "./pages/ImportPage";
import { LibraryPage } from "./pages/LibraryPage";
import { LibraryReportsPage } from "./pages/LibraryReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { RecommendationPage } from "./pages/RecommendationPage";
import { TagsPage } from "./pages/TagsPage";
import { TrackDetailPage } from "./pages/TrackDetailPage";
import { UploadPage } from "./pages/UploadPage";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RouteLink } from "./routes/RouteLink";
import { getRoute, navigateTo, useCurrentPath, type AppRoute } from "./routes/router";

const routeTitles: Record<AppRoute["name"], string> = {
  aiAssistant: "AI 助手",
  duplicates: "重复音轨",
  imports: "从服务器导入",
  library: "曲库",
  login: "登录",
  notFound: "页面不存在",
  playlists: "歌单",
  recommendations: "推荐",
  reports: "整理报告",
  tags: "标签",
  trackDetail: "音轨详情",
  upload: "上传",
};

export default function App() {
  const path = useCurrentPath();
  const route = getRoute(path);
  const title = routeTitles[route.name];

  useEffect(() => {
    document.title = `${title} · Easy Music`;
  }, [title]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  return (
    <ToastProvider>
      <ConfirmProvider>
        {route.name === "login" ? (
          <LoginPage />
        ) : (
          <ProtectedRoute>
            <SignedInApp path={path} route={route} title={title} />
          </ProtectedRoute>
        )}
      </ConfirmProvider>
    </ToastProvider>
  );
}

function SignedInApp({ path, route, title }: { path: string; route: AppRoute; title: string }) {
  const { logout } = useAuth();

  const handleSignOut = () => {
    void logout().finally(() => navigateTo("/login"));
  };

  return (
    <AppLayout onSignOut={handleSignOut} path={path} title={title}>
      {route.name === "library" ? <LibraryPage /> : null}
      {route.name === "playlists" ? <PlaylistsPage /> : null}
      {route.name === "duplicates" ? <DuplicateReviewPage /> : null}
      {route.name === "imports" ? <ImportPage /> : null}
      {route.name === "reports" ? <LibraryReportsPage /> : null}
      {route.name === "upload" ? <UploadPage /> : null}
      {route.name === "tags" ? <TagsPage /> : null}
      {route.name === "aiAssistant" ? <AiAssistantPage /> : null}
      {route.name === "recommendations" ? <RecommendationPage /> : null}
      {route.name === "trackDetail" ? (
        <TrackDetailPage key={route.params.trackId} trackId={route.params.trackId} />
      ) : null}
      {route.name === "notFound" ? (
        <div className="page">
          <div className="card">
            <EmptyState
              action={
                <RouteLink className="btn btn-primary" to="/library">
                  回到曲库
                </RouteLink>
              }
              description="这个地址不属于 Easy Music。可能是链接已过期，或音轨已被删除。"
              icon="compass"
              title="找不到这个页面"
            />
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
