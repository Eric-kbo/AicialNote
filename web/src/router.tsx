import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppShell } from './components/AppShell'
import { DetailPage } from './pages/DetailPage'
import { ListPage } from './pages/ListPage'
import { NotesHome, PagePage, SectionPage } from './pages/NotesPage'

const rootRoute = createRootRoute({ component: AppShell })

const listRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ListPage })

const detailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/i/$id', component: DetailPage })

const notesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes', component: NotesHome })

const sectionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/s/$sectionId', component: SectionPage })

const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$pageId', component: PagePage })

export const router = createRouter({
  routeTree: rootRoute.addChildren([listRoute, detailRoute, notesRoute, sectionRoute, pageRoute]),
  defaultPreload: false,
  scrollRestoration: false,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
