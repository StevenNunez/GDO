// useAppState is now provided by the react-tracked container in DataProvider.
// It keeps the same return shape as before, but with per-property render
// tracking so consumers only re-render for the fields they actually read.
export { useAppState, useAppSelector } from './DataProvider';
