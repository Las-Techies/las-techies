# Frontend

React + Vite client for the quiz flow.

## Folder structure

```text
frontend/
└── src/
    ├── app/
    │   └── App.tsx                    # route definitions
    ├── assets/                        # static images/icons
    ├── components/
    │   └── navigation/                # top nav and workflow tabs
    ├── features/
    │   └── quiz/                      # quiz domain types, storage, workflow constants
    ├── pages/                         # page-level screens
    ├── styles/
    │   └── global.css                 # global styling
    ├── main.tsx                       # app entry
    └── vite-env.d.ts
```

## Notes

- Keep page-specific logic inside `src/pages`.
- Put reusable quiz logic in `src/features/quiz`.
- Put shared UI pieces in `src/components`.
