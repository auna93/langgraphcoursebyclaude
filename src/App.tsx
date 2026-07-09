import { Route, Routes } from "react-router-dom";

import { Layout } from "@/app/Layout";
import { TemarioPage } from "@/pages/TemarioPage";
import { ModuloPage } from "@/pages/ModuloPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<TemarioPage />} />
        <Route path="/modulo/:id" element={<ModuloPage />} />
      </Route>
    </Routes>
  );
}
