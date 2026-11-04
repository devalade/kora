import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/app/$workspaceSlug/tasks')({
  component: TasksLayout,
});

function TasksLayout() {
  return <Outlet />;
}
