import { useCallback, useReducer } from 'react'
import type { PendingChange, PendingMap } from '../utils/brush'

interface PendingState {
  current: PendingMap
  past: PendingMap[]
  future: PendingMap[]
}

type PendingAction =
  | { type: 'patch'; key: string; change: PendingChange | null }
  | { type: 'replace'; map: PendingMap }
  | { type: 'clear' }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 100

function pushHistory(state: PendingState, next: PendingMap): PendingState {
  return {
    current: next,
    past: [...state.past, state.current].slice(-HISTORY_LIMIT),
    future: [],
  }
}

function reducer(state: PendingState, action: PendingAction): PendingState {
  switch (action.type) {
    case 'patch': {
      const next = { ...state.current }
      if (action.change) next[action.key] = action.change
      else delete next[action.key]
      if (Object.keys(next).length === Object.keys(state.current).length && action.change === null) {
        return state
      }
      return pushHistory(state, next)
    }
    case 'replace':
      return pushHistory(state, action.map)
    case 'clear':
      if (Object.keys(state.current).length === 0) return state
      return pushHistory(state, {})
    case 'reset':
      return { current: {}, past: [], future: [] }
    case 'undo': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        current: previous,
        past: state.past.slice(0, -1),
        future: [state.current, ...state.future].slice(0, HISTORY_LIMIT),
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return {
        current: next,
        past: [...state.past, state.current].slice(-HISTORY_LIMIT),
        future: rest,
      }
    }
    default:
      return state
  }
}

/**
 * 班表格位的暫存層（櫃台／房務共用）。
 * 所有改動都走 history，支援 undo/redo；真正寫入後端仍是「檢查並套用」。
 */
export function usePendingChanges() {
  const [state, dispatch] = useReducer(reducer, { current: {}, past: [], future: [] })

  const patch = useCallback(
    (key: string, change: PendingChange | null) => dispatch({ type: 'patch', key, change }),
    [],
  )
  const replace = useCallback((map: PendingMap) => dispatch({ type: 'replace', map }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  const count = Object.keys(state.current).length

  return {
    pending: state.current,
    count,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    patch,
    replace,
    clear,
    reset,
    undo,
    redo,
  }
}

export type PendingChangesApi = ReturnType<typeof usePendingChanges>
