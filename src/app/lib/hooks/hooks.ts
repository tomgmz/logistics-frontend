import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from '../store/index'

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector = <T>(selector: (s: RootState) => T) =>
  useSelector(selector)