from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.off_days import LeaveTypeCreate, LeaveTypeOut, LeaveTypeUpdate
from app.services import leave_type_service

router = APIRouter()


@router.get("/leave-types", response_model=list[LeaveTypeOut])
def list_leave_types(db: Session = Depends(get_db)):
    return leave_type_service.list_leave_types(db)


@router.post("/leave-types", response_model=LeaveTypeOut, status_code=status.HTTP_201_CREATED)
def create_leave_type(req: LeaveTypeCreate, db: Session = Depends(get_db)):
    try:
        return leave_type_service.create_leave_type(
            db, req.name, req.color_bg, req.color_text
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/leave-types/{code}", response_model=LeaveTypeOut)
def update_leave_type(code: str, req: LeaveTypeUpdate, db: Session = Depends(get_db)):
    try:
        return leave_type_service.update_leave_type(
            db, code, name=req.name, color_bg=req.color_bg, color_text=req.color_text
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/leave-types/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave_type(code: str, db: Session = Depends(get_db)):
    try:
        leave_type_service.delete_leave_type(db, code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
