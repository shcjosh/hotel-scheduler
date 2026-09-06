from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate
from app.services import employee_service

router = APIRouter()


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
    employees = employee_service.list_employees(db, include_inactive=include_inactive)
    return [employee_service.to_out(e) for e in employees]


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db)):
    try:
        employee = employee_service.create_employee(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return employee_service.to_out(employee)


@router.post("/employees/reorder", response_model=list[EmployeeOut])
def reorder_employees(employee_ids: list[int], db: Session = Depends(get_db)):
    employees = employee_service.reorder_employees(db, employee_ids)
    return [employee_service.to_out(e) for e in employees]


@router.get("/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = employee_service.get_employee(db, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee_service.to_out(employee)


@router.put("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int, data: EmployeeUpdate, db: Session = Depends(get_db)
):
    employee = employee_service.get_employee(db, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    try:
        employee = employee_service.update_employee(db, employee, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return employee_service.to_out(employee)


@router.delete("/employees/{employee_id}", response_model=EmployeeOut)
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = employee_service.get_employee(db, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    employee = employee_service.soft_delete_employee(db, employee)
    return employee_service.to_out(employee)
