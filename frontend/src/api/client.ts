import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail ?? error?.message ?? '未知錯誤'
    return Promise.reject(new Error(detail))
  },
)
