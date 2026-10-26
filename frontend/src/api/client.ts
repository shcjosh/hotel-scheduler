import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // detail 可能是字串，也可能是 FastAPI 422 的物件陣列；後者要 stringify，
    // 否則 new Error() 會得到 "[object Object],[object Object]"（還原 422 事件，2026-10-26）。
    const raw = error?.response?.data?.detail ?? error?.message ?? '未知錯誤'
    const detail = typeof raw === 'string' ? raw : JSON.stringify(raw)
    return Promise.reject(new Error(detail))
  },
)
