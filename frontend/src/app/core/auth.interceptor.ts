import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../environments/environment';

const LOCAL_LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const session = auth.session();
  const outgoing = session?.accessToken
    ? req.clone({ setHeaders: { Authorization: `Bearer ${session.accessToken}` } })
    : req;
  return next(outgoing).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.url !== LOCAL_LOGIN_URL) {
        const returnUrl = router.url;
        void auth.endSession().then(() => {
          if (!returnUrl.startsWith('/login')) {
            void router.navigate(['/login'], { queryParams: { returnUrl } });
          }
        });
      }
      return throwError(() => err);
    }),
  );
};
