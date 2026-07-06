import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
