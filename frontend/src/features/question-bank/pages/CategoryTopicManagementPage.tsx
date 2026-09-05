import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useCategories, useTopics } from '../api'
import { CreateCategoryDialog } from '../components/CreateCategoryDialog'
import { CreateTopicDialog } from '../components/CreateTopicDialog'
import { DeleteCategoryDialog } from '../components/DeleteCategoryDialog'
import { DeleteTopicDialog } from '../components/DeleteTopicDialog'
import { EditCategoryDialog } from '../components/EditCategoryDialog'
import { EditTopicDialog } from '../components/EditTopicDialog'
import type { QuestionCategory, QuestionTopic, QuestionType } from '../types'

const PICKER_PAGE_SIZE = 100

const TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'psychometric', label: 'Psychometric' },
]

// Type tabs at top -> left panel (categories for that type) -> right panel
// (topics for whichever category is selected), same "list + attached
// sub-entities + dialogs" shape as PoolDetailPage.tsx (criteria) and
// DepartmentListPage.tsx (departments scoped to a picked college), just
// laid out as two side-by-side panels instead of stacked sections since
// both categories and topics need their own always-visible list here (no
// drill-down navigation to a separate page). Create/Edit/Delete all reuse
// the same real, already-verified backend endpoints — see api.ts's own
// comment on the category/topic edit/delete hooks.
export default function CategoryTopicManagementPage() {
  const [type, setType] = useState<QuestionType>('mcq')
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | null>(null)
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<QuestionCategory | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<QuestionCategory | null>(null)
  const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<QuestionTopic | null>(null)
  const [deletingTopic, setDeletingTopic] = useState<QuestionTopic | null>(null)

  const categories = useCategories({ type, page: 1, pageSize: PICKER_PAGE_SIZE })
  const topics = useTopics(
    { categoryId: selectedCategory?.id ?? '', page: 1, pageSize: PICKER_PAGE_SIZE },
    { enabled: selectedCategory !== null },
  )

  function handleSelectType(nextType: QuestionType) {
    setType(nextType)
    setSelectedCategory(null)
  }

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title="Manage Categories & Topics"
        description="Organize the question bank's categories and topics, scoped by question type."
      />

      <Tabs value={type} onValueChange={(value) => handleSelectType(value as QuestionType)}>
        <TabsList>
          {TYPE_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Categories
            </h2>
            <Button size="sm" onClick={() => setIsNewCategoryOpen(true)}>
              New Category
            </Button>
          </div>

          {categories.isPending && (
            <div className="space-y-2 p-3.5" role="status" aria-label="Loading categories">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}

          {categories.isError && (
            <div className="p-3.5 text-sm text-destructive">
              Failed to load categories. Please try again.
            </div>
          )}

          {!categories.isPending && !categories.isError && (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(categories.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No categories yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (categories.data?.items ?? []).map((category) => (
                    <TableRow
                      key={category.id}
                      className={cn(
                        'cursor-pointer hover:bg-muted/30',
                        selectedCategory?.id === category.id && 'bg-muted/40',
                      )}
                      onClick={() => setSelectedCategory(category)}
                    >
                      <TableCell className="pl-4 font-medium text-primary">
                        {category.name}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div
                          className="flex justify-end gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingCategory(category)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive text-destructive hover:bg-destructive/5"
                            onClick={() => setDeletingCategory(category)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Topics{selectedCategory ? ` — ${selectedCategory.name}` : ''}
            </h2>
            {selectedCategory && (
              <Button size="sm" onClick={() => setIsNewTopicOpen(true)}>
                New Topic
              </Button>
            )}
          </div>

          {!selectedCategory && (
            <p className="p-3.5 text-sm text-muted-foreground">
              Select a category to view and manage its topics.
            </p>
          )}

          {selectedCategory && topics.isPending && (
            <div className="space-y-2 p-3.5" role="status" aria-label="Loading topics">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}

          {selectedCategory && topics.isError && (
            <div className="p-3.5 text-sm text-destructive">
              Failed to load topics. Please try again.
            </div>
          )}

          {selectedCategory && !topics.isPending && !topics.isError && (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(topics.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No topics yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (topics.data?.items ?? []).map((topic) => (
                    <TableRow key={topic.id} className="hover:bg-muted/30">
                      <TableCell className="pl-4 font-medium text-primary">{topic.name}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingTopic(topic)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive text-destructive hover:bg-destructive/5"
                            onClick={() => setDeletingTopic(topic)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <CreateCategoryDialog
        type={type}
        open={isNewCategoryOpen}
        onOpenChange={setIsNewCategoryOpen}
        onCreated={(category) => setSelectedCategory(category)}
      />

      {editingCategory && (
        <EditCategoryDialog
          category={editingCategory}
          open={Boolean(editingCategory)}
          onOpenChange={(open) => {
            if (!open) setEditingCategory(null)
          }}
        />
      )}

      {deletingCategory && (
        <DeleteCategoryDialog
          category={deletingCategory}
          open={Boolean(deletingCategory)}
          onOpenChange={(open) => {
            if (!open) setDeletingCategory(null)
          }}
          onDeleted={() => {
            if (selectedCategory?.id === deletingCategory.id) setSelectedCategory(null)
          }}
        />
      )}

      {selectedCategory && (
        <CreateTopicDialog
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
          open={isNewTopicOpen}
          onOpenChange={setIsNewTopicOpen}
          onCreated={() => {}}
        />
      )}

      {editingTopic && (
        <EditTopicDialog
          topic={editingTopic}
          open={Boolean(editingTopic)}
          onOpenChange={(open) => {
            if (!open) setEditingTopic(null)
          }}
        />
      )}

      {deletingTopic && (
        <DeleteTopicDialog
          topic={deletingTopic}
          open={Boolean(deletingTopic)}
          onOpenChange={(open) => {
            if (!open) setDeletingTopic(null)
          }}
        />
      )}
    </div>
  )
}
