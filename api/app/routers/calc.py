"""購屋試算工具：純粹數學，不含建議出價。"""
from pydantic import BaseModel, Field

from fastapi import APIRouter

router = APIRouter()


class MortgageReq(BaseModel):
    total_price: float = Field(..., gt=0, description="總價（元）")
    down_payment_pct: float = Field(0.20, ge=0, le=1, description="自備款比例 0~1")
    annual_rate: float = Field(0.022, ge=0, le=0.20, description="年利率（小數）")
    term_years: int = Field(30, ge=1, le=40, description="貸款年限")
    grace_years: int = Field(0, ge=0, le=10, description="寬限期（只繳息）")


class MortgageResp(BaseModel):
    loan_amount: float
    monthly_payment_after_grace: float
    monthly_interest_during_grace: float
    total_interest: float
    total_payment: float
    breakdown_first_year: list[dict]


@router.post("/mortgage", response_model=MortgageResp)
def mortgage(req: MortgageReq) -> MortgageResp:
    P = req.total_price * (1 - req.down_payment_pct)
    r = req.annual_rate / 12.0
    n_total = req.term_years * 12
    n_grace = req.grace_years * 12
    n_repay = n_total - n_grace

    if r == 0:
        m = P / n_repay
    else:
        m = P * (r * (1 + r) ** n_repay) / ((1 + r) ** n_repay - 1)

    grace_interest = P * r if n_grace > 0 else 0.0

    balance = P
    breakdown = []
    total_interest = 0.0
    for month in range(1, 13):
        if month <= n_grace:
            interest = balance * r
            principal = 0.0
            payment = interest
        else:
            interest = balance * r
            principal = m - interest
            balance -= principal
            payment = m
        total_interest += interest
        breakdown.append({
            "month": month, "payment": round(payment, 0),
            "interest": round(interest, 0), "principal": round(principal, 0),
            "balance": round(balance, 0),
        })

    # 全期總息粗估
    full_interest = grace_interest * n_grace + (m * n_repay - P)
    total_payment = grace_interest * n_grace + m * n_repay + req.total_price * req.down_payment_pct

    return MortgageResp(
        loan_amount=round(P, 0),
        monthly_payment_after_grace=round(m, 0),
        monthly_interest_during_grace=round(grace_interest, 0),
        total_interest=round(full_interest, 0),
        total_payment=round(total_payment, 0),
        breakdown_first_year=breakdown,
    )


class AffordReq(BaseModel):
    monthly_income: float = Field(..., gt=0, description="家戶月收入")
    monthly_obligations: float = Field(0, ge=0, description="現有每月固定支出（信貸、車貸等）")
    savings: float = Field(..., ge=0, description="可動用自備款")
    annual_rate: float = Field(0.022, ge=0, le=0.20)
    term_years: int = Field(30, ge=1, le=40)
    dti_ratio: float = Field(0.40, gt=0, le=0.60, description="月收入用於房貸上限比例（保守 0.30，常見 0.40）")


class AffordResp(BaseModel):
    affordable_monthly_payment: float
    max_loan_amount: float
    max_property_price: float
    notes: list[str]


@router.post("/affordability", response_model=AffordResp)
def affordability(req: AffordReq) -> AffordResp:
    afford_m = max(0.0, req.monthly_income * req.dti_ratio - req.monthly_obligations)

    r = req.annual_rate / 12.0
    n = req.term_years * 12
    if afford_m <= 0:
        loan = 0.0
    elif r == 0:
        loan = afford_m * n
    else:
        loan = afford_m * ((1 + r) ** n - 1) / (r * (1 + r) ** n)

    max_price = loan + req.savings

    notes = [
        f"以 DTI 上限 {int(req.dti_ratio*100)}% 估算",
        f"自備款 {req.savings:,.0f} 元、貸款上限約 {loan:,.0f} 元",
        "本試算未計入裝修、契稅、代書、仲介、家具等其他費用，建議再保留 5~10% 預備金。",
    ]
    return AffordResp(
        affordable_monthly_payment=round(afford_m, 0),
        max_loan_amount=round(loan, 0),
        max_property_price=round(max_price, 0),
        notes=notes,
    )


class StressReq(BaseModel):
    total_price: float = Field(..., gt=0)
    down_payment_pct: float = Field(0.20, ge=0, le=1)
    base_rate: float = Field(0.022, ge=0, le=0.20)
    term_years: int = Field(30, ge=1, le=40)
    bumps: list[float] = Field(default_factory=lambda: [0.005, 0.01, 0.015, 0.02])


class StressResp(BaseModel):
    base_monthly: float
    scenarios: list[dict]


@router.post("/stress-test", response_model=StressResp)
def stress_test(req: StressReq) -> StressResp:
    P = req.total_price * (1 - req.down_payment_pct)
    n = req.term_years * 12

    def m_at(rate: float) -> float:
        r = rate / 12
        if r == 0:
            return P / n
        return P * (r * (1 + r) ** n) / ((1 + r) ** n - 1)

    base = m_at(req.base_rate)
    scenarios = []
    for bump in req.bumps:
        new_rate = req.base_rate + bump
        new_m = m_at(new_rate)
        scenarios.append({
            "rate": round(new_rate, 4),
            "monthly": round(new_m, 0),
            "delta_monthly": round(new_m - base, 0),
            "delta_pct": round((new_m - base) / base, 4),
        })
    return StressResp(base_monthly=round(base, 0), scenarios=scenarios)


class RentVsBuyReq(BaseModel):
    total_price: float = Field(..., gt=0)
    down_payment_pct: float = Field(0.20, ge=0, le=1)
    annual_rate: float = Field(0.022, ge=0, le=0.20)
    term_years: int = Field(30, ge=1, le=40)
    monthly_rent: float = Field(..., gt=0, description="同地段租金")
    appreciation_per_year: float = Field(0.02, ge=-0.05, le=0.10)
    invest_alt_return: float = Field(0.04, ge=0, le=0.15, description="自備款若投資的年化報酬")
    horizon_years: int = Field(10, ge=1, le=30)


class RentVsBuyResp(BaseModel):
    buy_net_cost: float
    rent_net_cost: float
    breakeven_year: int | None
    note: str


@router.post("/rent-vs-buy", response_model=RentVsBuyResp)
def rent_vs_buy(req: RentVsBuyReq) -> RentVsBuyResp:
    """簡化的租或買試算（極簡模型，不含稅、修繕、管理費；視為粗略參考）。"""
    P = req.total_price
    down = P * req.down_payment_pct
    loan = P - down
    r = req.annual_rate / 12
    n = req.term_years * 12
    if r == 0:
        m = loan / n
    else:
        m = loan * (r * (1 + r) ** n) / ((1 + r) ** n - 1)

    breakeven: int | None = None
    final_buy = final_rent = 0.0
    rent = req.monthly_rent
    invested = down
    paid = down
    rent_paid = 0.0
    for year in range(1, req.horizon_years + 1):
        paid += m * 12
        rent_paid += rent * 12
        rent *= 1 + 0.02   # 假設租金年漲 2%
        invested *= 1 + req.invest_alt_return
        house_value = P * ((1 + req.appreciation_per_year) ** year)
        # 買方淨成本 = 已付支出 - 房屋現值 + 剩餘房貸
        # 剩餘房貸近似：用標準攤還公式回推
        if r == 0:
            remaining = max(0.0, loan - (m * 12 * year))
        else:
            paid_months = min(year * 12, n)
            remaining = loan * ((1 + r) ** n - (1 + r) ** paid_months) / ((1 + r) ** n - 1)
        buy_net = paid - house_value + remaining
        rent_net = rent_paid - (invested - down)
        if breakeven is None and buy_net <= rent_net:
            breakeven = year
        final_buy, final_rent = buy_net, rent_net

    return RentVsBuyResp(
        buy_net_cost=round(final_buy, 0),
        rent_net_cost=round(final_rent, 0),
        breakeven_year=breakeven,
        note="模型刻意簡化：未含房屋稅地價稅、管理費、修繕、契稅、代書、仲介、空屋風險。請當作粗略視覺化，勿作為決策唯一依據。",
    )
